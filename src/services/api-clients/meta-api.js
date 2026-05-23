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

  async getInstagramMentions() {
    if (!this.available) return [];
    // TODO: GET /{ig-user-id}/tags
    return [];
  }

  async replyToComment(commentId, message) {
    if (!this.available) return { success: false };
    // TODO: POST /{comment-id}/replies
    logger.info('[Meta] Would reply to comment', { commentId });
    return { success: true };
  }

  async getPageInsights({ metric, period }) {
    if (!this.available) return null;
    // TODO: GET /{page-id}/insights
    return null;
  }
}

module.exports = new MetaAPI();
