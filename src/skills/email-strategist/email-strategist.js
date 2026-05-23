'use strict';

const BaseSkill = require('../base-skill');
const { SKILLS } = require('../../config/constants');
const mailchimpApi = require('../../services/api-clients/mailchimp-api');

/**
 * SKILL 3: Email Strategist
 * Status: STUB — structure complete, Mailchimp integration wired.
 *
 * Job types handled:
 *   - create-campaign         → builds and queues an email campaign in Mailchimp
 *   - create-weekly-newsletter → full newsletter pipeline (Sunday 6 PM trigger)
 *   - manage-segmentation     → updates subscriber segments based on behaviour
 *   - send-campaign           → triggers a send for an already-created campaign
 */
class EmailStrategist extends BaseSkill {
  constructor() {
    super(SKILLS.EMAIL_STRATEGIST);
  }

  async execute(job) {
    switch (job.name) {
      case 'create-campaign':
        return this.createCampaign(job);
      case 'create-weekly-newsletter':
        return this.createWeeklyNewsletter(job);
      case 'manage-segmentation':
        return this.manageSegmentation(job);
      case 'send-campaign':
        return this.sendCampaign(job);
      default:
        throw new Error(`Email Strategist: unknown job "${job.name}"`);
    }
  }

  async createCampaign(job) {
    const { subject, content, segmentId } = job.data;
    this.log.info('Creating email campaign', { jobId: job.id, subject });

    // TODO (Phase 3): Use content from Content Generator + Email_Tool output
    const result = await mailchimpApi.createCampaign({ subject, htmlContent: content, segmentId });
    return { success: result.success, campaignId: result.campaignId, jobId: job.id };
  }

  async createWeeklyNewsletter(job) {
    this.log.info('Creating weekly newsletter', { jobId: job.id });
    // TODO (Phase 3):
    // 1. Query Content Generator for top content of the week
    // 2. Assemble newsletter with Email_Tool
    // 3. Send to Brand Guardian for review
    // 4. Schedule via Mailchimp
    return { status: 'pending_implementation', jobId: job.id };
  }

  async manageSegmentation(job) {
    this.log.info('Updating email segments', { jobId: job.id });
    const segments = await mailchimpApi.getListSegments();
    // TODO (Phase 3): dynamic segmentation based on Shopify purchase data
    return { segments, jobId: job.id };
  }

  async sendCampaign(job) {
    const { campaignId } = job.data;
    const result = await mailchimpApi.sendCampaign(campaignId);
    return { success: result.success, campaignId, jobId: job.id };
  }
}

module.exports = EmailStrategist;
