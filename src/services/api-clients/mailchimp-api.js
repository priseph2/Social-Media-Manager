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

  get _headers() {
    // Mailchimp uses HTTP Basic auth: any username + API key as password
    const creds = Buffer.from(`anystring:${this.apiKey}`).toString('base64');
    return {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/json',
    };
  }

  async _request(path, method = 'GET', body = null) {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const opts = { method, headers: this._headers, signal: controller.signal };
    if (body) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, opts);
      if (!res.ok) throw new Error(`Mailchimp ${method} ${path} → ${res.status}`);
      if (res.status === 204) return null;
      return res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Create a regular campaign and set its HTML content.
   *
   * @param {object} opts
   * @param {string} opts.subject      - email subject line
   * @param {string} opts.previewText  - preview/preheader text
   * @param {string} opts.htmlContent  - full HTML body
   * @param {string} [opts.segmentId]  - optional segment to send to
   * @param {string} [opts.fromName]   - sender display name
   * @param {string} [opts.replyTo]    - reply-to address
   * @returns {{ success: boolean, campaignId?: string }}
   */
  async createCampaign({ subject, previewText, htmlContent, segmentId, fromName, replyTo }) {
    if (!this.available) return { success: false, reason: 'Mailchimp not configured' };
    try {
      const campaignBody = {
        type: 'regular',
        recipients: { list_id: this.listId },
        settings: {
          subject_line: subject,
          preview_text: previewText || '',
          from_name: fromName || 'Your Brand',
          reply_to: replyTo || process.env.MAILCHIMP_REPLY_TO || '',
        },
      };

      if (segmentId) {
        const segId = parseInt(String(segmentId), 10);
        if (isNaN(segId)) throw new Error(`Invalid Mailchimp segment ID: ${segmentId}`);
        campaignBody.recipients.segment_opts = { saved_segment_id: segId };
      }

      const created = await this._request('/campaigns', 'POST', campaignBody);
      const campaignId = created?.id;
      if (!campaignId) throw new Error('Mailchimp did not return a campaign ID');

      // Set the HTML content in a second call
      await this._request(`/campaigns/${encodeURIComponent(campaignId)}/content`, 'PUT', { html: htmlContent });

      logger.info('[Mailchimp] Campaign created', { campaignId, subject });
      return { success: true, campaignId };
    } catch (err) {
      logger.error('[Mailchimp] createCampaign failed', { subject, error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Send an existing campaign immediately.
   *
   * @param {string} campaignId
   */
  async sendCampaign(campaignId) {
    if (!this.available) return { success: false, reason: 'Mailchimp not configured' };
    try {
      await this._request(`/campaigns/${encodeURIComponent(campaignId)}/actions/send`, 'POST');
      logger.info('[Mailchimp] Campaign sent', { campaignId });
      return { success: true };
    } catch (err) {
      logger.error('[Mailchimp] sendCampaign failed', { campaignId, error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * List segments for the configured audience list.
   *
   * @returns {Array<{ id: number, name: string, memberCount: number }>}
   */
  async getListSegments() {
    if (!this.available) return [];
    try {
      const data = await this._request(
        `/lists/${this.listId}/segments?count=100&fields=segments.id,segments.name,segments.member_count`
      );
      return (data?.segments ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        memberCount: s.member_count,
      }));
    } catch (err) {
      logger.warn('[Mailchimp] getListSegments failed', { error: err.message });
      return [];
    }
  }

  /**
   * Fetch the performance report for a sent campaign.
   *
   * @param {string} campaignId
   * @returns {object|null}
   */
  async getCampaignReport(campaignId) {
    if (!this.available) return null;
    try {
      const data = await this._request(`/reports/${encodeURIComponent(campaignId)}`);
      return {
        campaignId: data?.id,
        subject: data?.subject_line,
        sends: data?.emails_sent,
        opens: data?.opens?.opens_total,
        uniqueOpens: data?.opens?.unique_opens,
        openRate: data?.opens?.open_rate,
        clicks: data?.clicks?.clicks_total,
        uniqueClicks: data?.clicks?.unique_clicks,
        clickRate: data?.clicks?.click_rate,
        unsubscribes: data?.unsubscribes?.unsubscribes,
        bounces: (data?.bounces?.hard_bounces || 0) + (data?.bounces?.soft_bounces || 0),
        revenue: data?.revenue_data?.total_revenue,
        sendTime: data?.send_time,
      };
    } catch (err) {
      logger.warn('[Mailchimp] getCampaignReport failed', { campaignId, error: err.message });
      return null;
    }
  }
}

module.exports = new MailchimpAPI();
