'use strict';

const logger = require('../../utils/logger');

class BufferAPI {
  constructor() {
    this.accessToken = process.env.BUFFER_ACCESS_TOKEN;
    this.baseUrl = 'https://api.bufferapp.com/1';
    this.profileIds = {
      instagram: process.env.BUFFER_PROFILE_ID_INSTAGRAM,
      facebook: process.env.BUFFER_PROFILE_ID_FACEBOOK,
      twitter: process.env.BUFFER_PROFILE_ID_TWITTER,
      tiktok: process.env.BUFFER_PROFILE_ID_TIKTOK,
      pinterest: process.env.BUFFER_PROFILE_ID_PINTEREST,
    };
    this.available = Boolean(this.accessToken);
    if (!this.available) logger.warn('Buffer API not configured — social scheduling disabled.');
  }

  async _request(path, method = 'GET', params = null) {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));

    let url = `${this.baseUrl}${path}`;
    const opts = {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}` },
    };

    if (params) {
      if (method === 'GET') {
        url += '?' + new URLSearchParams(params).toString();
      } else {
        // Buffer v1 uses application/x-www-form-urlencoded for POST
        opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        opts.body = new URLSearchParams(params).toString();
      }
    }

    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Buffer ${method} ${path} → ${res.status}: ${text}`);
    }
    return res.json();
  }

  /**
   * Schedule a post via Buffer.
   *
   * @param {object} opts
   * @param {string} opts.platform  - instagram | facebook | twitter | tiktok | pinterest
   * @param {string} opts.text      - post caption
   * @param {string[]} opts.mediaUrls - optional media attachment URLs
   * @param {string|Date} opts.scheduledAt - ISO 8601 datetime or Date object
   * @returns {{ success: boolean, updateId?: string, scheduled?: boolean }}
   */
  async schedulePost({ platform, text, mediaUrls = [], scheduledAt }) {
    if (!this.available) return { success: false, reason: 'Buffer not configured' };
    const profileId = this.profileIds[platform];
    if (!profileId) return { success: false, reason: `No Buffer profile ID for ${platform}` };

    try {
      const scheduledAtTs = scheduledAt
        ? Math.floor(new Date(scheduledAt).getTime() / 1000)
        : null;

      const params = {
        profile_ids: profileId,
        text,
        scheduled_at: scheduledAtTs ? String(scheduledAtTs) : undefined,
      };

      // Attach media if provided (Buffer accepts up to 4 for carousel)
      mediaUrls.slice(0, 4).forEach((url, i) => {
        params[`media[photo${i > 0 ? i : ''}]`] = url;
      });

      const data = await this._request('/updates/create.json', 'POST', params);
      logger.info('[Buffer] Post scheduled', { platform, updateId: data?.updates?.[0]?.id });
      return {
        success: data?.success !== false,
        updateId: data?.updates?.[0]?.id,
        scheduled: true,
        platform,
        scheduledAt,
      };
    } catch (err) {
      logger.error('[Buffer] schedulePost failed', { platform, error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Fetch sent posts for a profile within a date range.
   *
   * @param {object} opts
   * @param {string} opts.profileId - Buffer profile ID
   * @param {string|Date} [opts.since] - start date
   * @param {string|Date} [opts.until] - end date
   * @param {number} [opts.count=50]   - max results
   */
  async getAnalytics({ profileId, since, until, count = 50 } = {}) {
    if (!this.available) return null;
    if (!profileId) return null;

    try {
      const params = { count: String(count) };
      if (since) params.since = String(Math.floor(new Date(since).getTime() / 1000));
      if (until) params.until = String(Math.floor(new Date(until).getTime() / 1000));

      const data = await this._request(`/profiles/${encodeURIComponent(profileId)}/updates/sent.json`, 'GET', params);
      return data?.updates ?? [];
    } catch (err) {
      logger.warn('[Buffer] getAnalytics failed', { profileId, error: err.message });
      return null;
    }
  }
}

module.exports = new BufferAPI();
