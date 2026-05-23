'use strict';

const logger = require('../../utils/logger');

class TidioAPI {
  constructor() {
    this.apiKey = process.env.TIDIO_API_KEY;
    this.available = Boolean(this.apiKey);
    if (!this.available) logger.warn('Tidio not configured — live chat integration disabled.');
  }

  async getOpenConversations() {
    if (!this.available) return [];
    // TODO: GET https://api.tidio.co/api/v1/conversations
    return [];
  }

  async sendMessage(conversationId, message) {
    if (!this.available) return { success: false };
    // TODO: POST /conversations/{id}/messages
    return { success: true };
  }
}

module.exports = new TidioAPI();
