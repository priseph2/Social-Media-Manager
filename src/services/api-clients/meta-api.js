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
   * @param {number} [opts.scheduledPublishTime] - Unix timestamp for scheduled posts
   */
  async publishPagePost({ message, link, scheduledPublishTime } = {}) {
    if (!this.available) return { success: false, reason: 'Meta not configured' };
    try {
      const params = { message, published: 'true' };
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

  /**
   * Publish a photo post to Instagram via the two-step Graph API flow.
   *
   * Step 1: create a media container with caption + image URL.
   * Step 2: publish the container.
   *
   * Requires instagram_content_publish permission.
   * Falls back gracefully if igBusinessId is not set.
   *
   * @param {object} opts
   * @param {string} opts.caption            - post caption
   * @param {string} [opts.imageUrl]         - publicly accessible image URL
   * @param {number} [opts.scheduledPublishTime] - Unix timestamp (requires content_scheduling permission)
   */
  async publishInstagramPost({ caption, imageUrl, scheduledPublishTime } = {}) {
    if (!this.available) return { success: false, reason: 'Meta not configured' };
    if (!this.igBusinessId) return { success: false, reason: 'INSTAGRAM_BUSINESS_ACCOUNT_ID not set' };
    if (!imageUrl) return { success: false, reason: 'Instagram requires an image URL for native publishing' };

    try {
      // Step 1: create media container
      const containerParams = { caption };
      if (imageUrl) {
        containerParams.image_url = imageUrl;
        containerParams.media_type = 'IMAGE';
      }
      if (scheduledPublishTime) {
        containerParams.published = 'false';
        containerParams.scheduled_publish_time = String(scheduledPublishTime);
      }

      const container = await this._request(`/${this.igBusinessId}/media`, 'POST', containerParams);
      if (!container?.id) throw new Error('No container ID returned from Instagram media create');

      // Step 2: publish the container
      const result = await this._request(`/${this.igBusinessId}/media_publish`, 'POST', {
        creation_id: container.id,
      });

      logger.info('[Meta] Instagram post published', { postId: result?.id });
      return { success: true, postId: result?.id, containerId: container.id };
    } catch (err) {
      logger.error('[Meta] publishInstagramPost failed', { error: err.message });
      return { success: false, error: err.message };
    }
  }
}

module.exports = new MetaAPI();
