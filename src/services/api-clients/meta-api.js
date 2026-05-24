'use strict';

const logger = require('../../utils/logger');

class MetaAPI {
  constructor() {
    this.accessToken = process.env.META_ACCESS_TOKEN;
    this.pageId = process.env.META_PAGE_ID;
    this.igBusinessId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    this.baseUrl = 'https://graph.facebook.com/v20.0';
    this.available = Boolean(this.accessToken && this.pageId);
    if (!this.available) logger.warn('Meta API not configured — Instagram/Facebook direct access disabled.');
  }

  async _request(path, method = 'GET', params = null) {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));

    const query = new URLSearchParams({ access_token: this.accessToken });
    let url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const opts = { method, headers: { 'Content-Type': 'application/json' }, signal: controller.signal };

    if (method === 'GET') {
      if (params) Object.entries(params).forEach(([k, v]) => query.set(k, v));
      url += '?' + query.toString();
    } else {
      url += '?' + query.toString();
      if (params) opts.body = JSON.stringify(params);
    }

    try {
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(`Meta ${method} ${path} → ${res.status}`);
      return res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetch Instagram media the account is tagged in (mentions).
   *
   * Requires instagram_manage_comments permission.
   * Returns an array of normalised mention objects.
   */
  async getInstagramMentions() {
    if (!this.available || !this.igBusinessId) return [];
    try {
      const data = await this._request(`/${this.igBusinessId}/tags`, 'GET', {
        fields: 'id,text,timestamp,from,media_type,permalink',
        limit: '50',
      });
      return (data?.data ?? []).map((m) => ({
        id: m.id,
        text: m.text || '',
        from: m.from?.id || null,
        mediaType: m.media_type || null,
        permalink: m.permalink || null,
        timestamp: m.timestamp,
      }));
    } catch (err) {
      logger.warn('[Meta] getInstagramMentions failed', { error: err.message });
      return [];
    }
  }

  /**
   * Reply to an Instagram or Facebook comment.
   *
   * @param {string} commentId - Graph API comment ID
   * @param {string} message   - reply text
   */
  async replyToComment(commentId, message) {
    if (!this.available) return { success: false, reason: 'Meta not configured' };
    try {
      const idStr = String(commentId).trim();
      // Meta Graph API comment IDs are underscore-separated numeric strings: {postId}_{commentId}
      if (!/^\d+(_\d+)*$/.test(idStr)) throw new Error(`Invalid Meta comment ID: ${commentId}`);
      const safeId = encodeURIComponent(idStr);
      const data = await this._request(`/${safeId}/replies`, 'POST', { message });
      logger.info('[Meta] Comment reply sent', { commentId });
      return { success: true, replyId: data?.id };
    } catch (err) {
      logger.error('[Meta] replyToComment failed', { commentId, error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Fetch Facebook Page insights.
   *
   * @param {object} opts
   * @param {string} opts.metric  - e.g. 'page_impressions', 'page_engaged_users'
   * @param {string} opts.period  - day | week | month | lifetime
   * @param {string} [opts.since] - Unix timestamp or ISO date
   * @param {string} [opts.until] - Unix timestamp or ISO date
   */
  async getPageInsights({ metric, period, since, until } = {}) {
    if (!this.available) return null;
    try {
      const params = {
        metric: metric || 'page_impressions,page_engaged_users,page_fans',
        period: period || 'month',
      };
      if (since) params.since = String(since);
      if (until) params.until = String(until);

      const data = await this._request(`/${this.pageId}/insights`, 'GET', params);
      return data?.data ?? null;
    } catch (err) {
      logger.warn('[Meta] getPageInsights failed', { metric, error: err.message });
      return null;
    }
  }

  /**
   * Publish a post to a Facebook Page.
   *
   * @param {object} opts
   * @param {string} opts.message     - post text
   * @param {string} [opts.link]      - URL to attach
   * @param {string} [opts.published] - 'true' | 'false' (default 'true')
   * @param {number} [opts.scheduledPublishTime] - Unix timestamp for scheduled posts
   */
  async publishPagePost({ message, link, published = 'true', scheduledPublishTime } = {}) {
    if (!this.available) return { success: false, reason: 'Meta not configured' };
    try {
      const params = { message, published };
      if (link) params.link = link;
      if (scheduledPublishTime) {
        params.published = 'false';
        params.scheduled_publish_time = String(scheduledPublishTime);
      }
      const data = await this._request(`/${this.pageId}/feed`, 'POST', params);
      logger.info('[Meta] Page post published', { postId: data?.id });
      return { success: true, postId: data?.id };
    } catch (err) {
      logger.error('[Meta] publishPagePost failed', { error: err.message });
      return { success: false, error: err.message };
    }
  }
}

module.exports = new MetaAPI();
