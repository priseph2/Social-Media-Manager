'use strict';

const { getSupabaseClient } = require('../../services/database/supabase-client');
const logger = require('../../utils/logger');

// In-memory cache with 5-minute TTL
let _cache = { ips: new Set(), domains: new Set(), emails: new Set(), loadedAt: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000;

async function _refreshCache() {
  try {
    const db = getSupabaseClient();
    if (!db) return;
    const { data } = await db.from('ip_blocklist').select('value, type');
    const next = { ips: new Set(), domains: new Set(), emails: new Set(), loadedAt: Date.now() };
    for (const row of (data || [])) {
      if (row.type === 'ip') next.ips.add(row.value);
      else if (row.type === 'domain') next.domains.add(row.value.toLowerCase());
      else if (row.type === 'email') next.emails.add(row.value.toLowerCase());
    }
    _cache = next;
    logger.debug(`[Blocklist] Cache refreshed — ${next.ips.size} IPs, ${next.domains.size} domains, ${next.emails.size} emails`);
  } catch (err) {
    logger.error('[Blocklist] Cache refresh failed', { error: err.message });
  }
}

async function _ensureFresh() {
  if (Date.now() - _cache.loadedAt > CACHE_TTL_MS) await _refreshCache();
}

/**
 * Express middleware: blocks requests from IPs in the blocklist.
 * Mount this before authenticated routes in app.js.
 */
async function blocklistMiddleware(req, res, next) {
  try {
    await _ensureFresh();
    const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.ip || '';
    if (ip && _cache.ips.has(ip)) {
      logger.warn('[Blocklist] Blocked IP', { ip, path: req.path, method: req.method });
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  } catch {
    next(); // fail-open: never block legitimate traffic on cache errors
  }
}

/**
 * Check whether an email address (or its domain) is in the admin blocklist.
 * Call this from validateSignup in abuse-prevention.js.
 * Returns { blocked: false } or { blocked: true, reason: string }.
 */
async function isEmailBlocklisted(email) {
  if (!email) return { blocked: false };
  try {
    await _ensureFresh();
    const lower = email.toLowerCase().trim();
    if (_cache.emails.has(lower)) return { blocked: true, reason: 'This email address has been blocked.' };
    const domain = lower.split('@')[1];
    if (domain && _cache.domains.has(domain)) return { blocked: true, reason: 'Signups from this email domain are not permitted.' };
    return { blocked: false };
  } catch {
    return { blocked: false }; // fail-open
  }
}

/**
 * Invalidate the cache immediately (call after adding/removing blocklist entries).
 */
function invalidateBlocklistCache() {
  _cache.loadedAt = 0;
}

module.exports = { blocklistMiddleware, isEmailBlocklisted, invalidateBlocklistCache };
