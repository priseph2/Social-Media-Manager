'use strict';

const logger = require('../../utils/logger');

const BASE_URL = 'https://app.ayrshare.com/api';

class AyrshareAPI {
  constructor() {
    this.apiKey = process.env.AYRSHARE_API_KEY;
    this.available = Boolean(this.apiKey);
    if (!this.available) logger.warn('Ayrshare API not configured — social scheduling disabled for non-native platforms.');
  }

  async _request(path, method = 'GET', body = null) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const opts = {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    };
    if (body) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(`${BASE_URL}${path}`, opts);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || `Ayrshare ${method} ${path} → ${res.status}`);
      return json;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Schedule or immediately publish a post via Ayrshare.
   *
   * @param {object} opts
   * @param {string|string[]} opts.platform  - 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'tiktok' | 'pinterest' | string[]
   * @param {string}          opts.text      - post caption / text
   * @param {string[]}        [opts.mediaUrls] - public image/video URLs (max 4)
   * @param {string|Date}     [opts.scheduledAt] - ISO 8601 datetime; omit to post immediately
   * @returns {{ success: boolean, id?: string, postIds?: object, scheduled?: boolean }}
   */
  async schedulePost({ platform, text, mediaUrls = [], scheduledAt }) {
    if (!this.available) return { success: false, reason: 'Ayrshare not configured' };

    const platforms = Array.isArray(platform) ? platform : [platform];

    const payload = {
      post: text,
      platforms,
    };

    if (mediaUrls.length) payload.mediaUrls = mediaUrls.slice(0, 4);
    if (scheduledAt) payload.scheduleDate = new Date(scheduledAt).toISOString();

    try {
      const data = await this._request('/post', 'POST', payload);
      const id = data?.id;
      logger.info('[Ayrshare] Post scheduled', { platforms, id });
      return {
        success: data?.status === 'success' || Boolean(id),
        id,
        postIds: data?.postIds,
        scheduled: Boolean(scheduledAt),
        platform,
      };
    } catch (err) {
      logger.error('[Ayrshare] schedulePost failed', { platforms, error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Fetch post history / analytics for a platform.
   *
   * @param {object} opts
   * @param {string} opts.platform
   * @param {number} [opts.count=20]
   * @returns {object[]|null}
   */
  async getPostHistory({ platform, count = 20 } = {}) {
    if (!this.available) return null;
    try {
      const data = await this._request(`/history?platform=${encodeURIComponent(platform)}&lastResults=${count}`);
      return data?.history ?? [];
    } catch (err) {
      logger.warn('[Ayrshare] getPostHistory failed', { platform, error: err.message });
      return null;
    }
  }

  /**
   * Returns connected social profiles on this Ayrshare account.
   */
  async getProfiles() {
    if (!this.available) return null;
    try {
      const data = await this._request('/user');
      return data?.activeSocialAccounts ?? [];
    } catch (err) {
      logger.warn('[Ayrshare] getProfiles failed', { error: err.message });
      return null;
    }
  }
}

module.exports = new AyrshareAPI();
