'use strict';

const crypto = require('crypto');
const logger = require('../../utils/logger');

const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REPORT_URL = (propertyId) =>
  `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

/**
 * Google Analytics 4 Data API v1beta client.
 *
 * Auth: service account JWT (no extra npm packages — uses Node built-in crypto).
 *
 * Required env vars:
 *   GA4_PROPERTY_ID       — numeric property ID (e.g. 123456789)
 *   GA4_CLIENT_EMAIL      — service account email
 *   GA4_PRIVATE_KEY       — service account private key (PEM, \n escaped)
 *
 * The class also accepts per-call overrides via the options parameter on each
 * method so the data-aggregator can pass per-tenant credentials.
 */
class GoogleAnalyticsAPI {
  constructor() {
    this.defaultPropertyId = process.env.GA4_PROPERTY_ID;
    this.defaultClientEmail = process.env.GA4_CLIENT_EMAIL;
    this.defaultPrivateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, '\n');
    this.available = Boolean(this.defaultPropertyId && this.defaultClientEmail && this.defaultPrivateKey);
    if (!this.available) logger.warn('GA4 not fully configured — website analytics disabled.');

    // Per-instance token cache: { token, expiresAt }
    this._tokenCache = null;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async _getAccessToken(clientEmail, privateKey) {
    const cacheKey = clientEmail;
    if (
      this._tokenCache?.email === cacheKey &&
      Date.now() < this._tokenCache.expiresAt
    ) {
      return this._tokenCache.token;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: clientEmail,
        scope: GA4_SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      })
    ).toString('base64url');

    const signingInput = `${header}.${payload}`;
    const signature = crypto
      .sign('RSA-SHA256', Buffer.from(signingInput), privateKey)
      .toString('base64url');
    const jwt = `${signingInput}.${signature}`;

    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GA4 token exchange failed: ${text}`);
    }

    const { access_token, expires_in } = await res.json();
    this._tokenCache = {
      email: cacheKey,
      token: access_token,
      expiresAt: Date.now() + (expires_in - 60) * 1000,
    };
    return access_token;
  }

  // ── Core report runner ────────────────────────────────────────────────────

  async _runReport(dimensions, metrics, dateRanges, creds = {}) {
    const propertyId = creds.propertyId || this.defaultPropertyId;
    const clientEmail = creds.clientEmail || this.defaultClientEmail;
    const privateKey = (creds.privateKey || this.defaultPrivateKey || '').replace(/\\n/g, '\n');

    if (!propertyId || !clientEmail || !privateKey) {
      throw new Error('GA4: missing propertyId, clientEmail, or privateKey');
    }

    const token = await this._getAccessToken(clientEmail, privateKey);
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));

    const res = await fetch(REPORT_URL(propertyId), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dimensions, metrics, dateRanges }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GA4 runReport failed (${propertyId}): ${text}`);
    }
    return res.json();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _parseRows(report) {
    const headers = report.dimensionHeaders?.map((h) => h.name) || [];
    const metricHeaders = report.metricHeaders?.map((h) => h.name) || [];
    return (report.rows || []).map((row) => {
      const obj = {};
      (row.dimensionValues || []).forEach((v, i) => { obj[headers[i]] = v.value; });
      (row.metricValues || []).forEach((v, i) => { obj[metricHeaders[i]] = parseFloat(v.value); });
      return obj;
    });
  }

  _isConfigured(creds = {}) {
    const hasEnv = this.available;
    const hasCreds = creds.propertyId && creds.clientEmail && creds.privateKey;
    return hasEnv || hasCreds;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Returns { activeUsers, sessions, pageViews } for the date range.
   * creds: optional per-tenant override { propertyId, clientEmail, privateKey }
   */
  async getActiveUsers({ startDate, endDate }, creds = {}) {
    if (!this._isConfigured(creds)) return null;
    try {
      const report = await this._runReport(
        [{ name: 'date' }],
        [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
        [{ startDate, endDate }],
        creds
      );
      const rows = this._parseRows(report);
      return {
        activeUsers: rows.reduce((s, r) => s + (r.activeUsers || 0), 0),
        sessions: rows.reduce((s, r) => s + (r.sessions || 0), 0),
        pageViews: rows.reduce((s, r) => s + (r.screenPageViews || 0), 0),
      };
    } catch (err) {
      logger.warn('GA4 getActiveUsers failed', { error: err.message });
      return null;
    }
  }

  /**
   * Returns top pages sorted by views.
   */
  async getTopPages({ startDate, endDate, limit = 10 }, creds = {}) {
    if (!this._isConfigured(creds)) return [];
    try {
      const report = await this._runReport(
        [{ name: 'pagePath' }, { name: 'pageTitle' }],
        [{ name: 'screenPageViews' }, { name: 'sessions' }, { name: 'bounceRate' }],
        [{ startDate, endDate }],
        creds
      );
      const rows = this._parseRows(report);
      return rows
        .sort((a, b) => (b.screenPageViews || 0) - (a.screenPageViews || 0))
        .slice(0, limit)
        .map((r) => ({
          path: r.pagePath,
          title: r.pageTitle,
          views: r.screenPageViews,
          sessions: r.sessions,
          bounceRate: r.bounceRate,
        }));
    } catch (err) {
      logger.warn('GA4 getTopPages failed', { error: err.message });
      return [];
    }
  }

  /**
   * Returns conversion and revenue metrics (requires ecommerce or goals configured in GA4).
   */
  async getConversionMetrics({ startDate, endDate }, creds = {}) {
    if (!this._isConfigured(creds)) return null;
    try {
      const report = await this._runReport(
        [{ name: 'date' }],
        [{ name: 'conversions' }, { name: 'totalRevenue' }, { name: 'transactions' }],
        [{ startDate, endDate }],
        creds
      );
      const rows = this._parseRows(report);
      return {
        conversions: rows.reduce((s, r) => s + (r.conversions || 0), 0),
        revenue: rows.reduce((s, r) => s + (r.totalRevenue || 0), 0),
        transactions: rows.reduce((s, r) => s + (r.transactions || 0), 0),
      };
    } catch (err) {
      logger.warn('GA4 getConversionMetrics failed', { error: err.message });
      return null;
    }
  }
}

module.exports = new GoogleAnalyticsAPI();
