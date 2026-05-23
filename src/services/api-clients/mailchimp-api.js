'use strict';

const logger = require('../../utils/logger');

class MailchimpAPI {
  constructor() {
    this.apiKey = process.env.MAILCHIMP_API_KEY;
    this.server = process.env.MAILCHIMP_SERVER_PREFIX || 'us1';
    this.listId = process.env.MAILCHIMP_LIST_ID;
    this.baseUrl = this.apiKey ? `https://${this.server}.api.mailchimp.com/3.0` : null;
    this.available = Boolean(this.apiKey && this.listId);
    if (!this.available) logger.warn('Mailchimp not configured — email campaigns disabled.');
  }

  async createCampaign({ subject, previewText, htmlContent, segmentId }) {
    if (!this.available) return { success: false, reason: 'Mailchimp not configured' };
    // TODO: POST /campaigns then PUT /campaigns/{id}/content
    logger.info('[Mailchimp] Would create campaign', { subject });
    return { success: true, campaignId: 'mock-id' };
  }

  async sendCampaign(campaignId) {
    if (!this.available) return { success: false };
    // TODO: POST /campaigns/{id}/actions/send
    return { success: true };
  }

  async getListSegments() {
    if (!this.available) return [];
    // TODO: GET /lists/{listId}/segments
    return [];
  }

  async getCampaignReport(campaignId) {
    if (!this.available) return null;
    // TODO: GET /reports/{campaignId}
    return null;
  }
}

module.exports = new MailchimpAPI();
