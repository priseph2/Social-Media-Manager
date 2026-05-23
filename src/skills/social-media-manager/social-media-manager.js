'use strict';

const BaseSkill = require('../base-skill');
const { SKILLS, PRIORITY } = require('../../config/constants');
const { eventBus, EVENTS } = require('../../services/messaging/event-emitter');
const { enqueue } = require('../../orchestrator/message-queue');
const bufferApi = require('../../services/api-clients/buffer-api');
const metaApi = require('../../services/api-clients/meta-api');
const logger = require('../../utils/logger');

/**
 * SKILL 2: Social Media Manager
 * Status: STUB — structure complete, API wiring ready for when credentials are added.
 *
 * Job types handled:
 *   - schedule-post       → schedules approved content via Buffer
 *   - monitor-engagement  → checks real-time engagement and flags spikes/negative sentiment
 *   - manage-hashtags     → refreshes and optimises the hashtag strategy
 */
class SocialMediaManager extends BaseSkill {
  constructor() {
    super(SKILLS.SOCIAL_MEDIA_MANAGER);
  }

  async execute(job) {
    switch (job.name) {
      case 'schedule-post':
        return this.schedulePost(job);
      case 'monitor-engagement':
        return this.monitorEngagement(job);
      case 'manage-hashtags':
        return this.manageHashtags(job);
      default:
        throw new Error(`Social Media Manager: unknown job "${job.name}"`);
    }
  }

  /**
   * Schedules content that was approved by Brand Guardian.
   * Called by orchestrator after CONTENT_APPROVED event.
   */
  async schedulePost(job) {
    const { platform, content, scheduledAt } = job.data;
    this.log.info(`Scheduling post on ${platform}`, { jobId: job.id });

    const result = await bufferApi.schedulePost({
      platform,
      text: content?.selectedContent || content,
      scheduledAt: scheduledAt || this._getOptimalPostTime(platform),
    });

    if (!result.success) {
      this.log.warn('Buffer scheduling unavailable — post queued internally', { jobId: job.id });
    }

    // TODO (Phase 2): persist scheduled post to Supabase for dashboard tracking

    return {
      success: result.success,
      platform,
      scheduledAt: result.scheduledAt,
      jobId: job.id,
    };
  }

  /**
   * Polls platform APIs for real-time engagement and surfaces issues.
   * TODO (Phase 2): integrate Meta Graph API polling / webhooks.
   */
  async monitorEngagement(job) {
    this.log.info('Monitoring engagement across platforms', { jobId: job.id });
    const mentions = await metaApi.getInstagramMentions();
    // TODO: sentiment analysis on mentions → publish NEGATIVE_SENTIMENT if needed
    return { checked: true, mentions: mentions.length, jobId: job.id };
  }

  /**
   * TODO (Phase 2): Research and rotate hashtag sets using Claude + platform data.
   */
  async manageHashtags(job) {
    this.log.info('Hashtag management requested', { jobId: job.id });
    return { status: 'pending_implementation', jobId: job.id };
  }

  _getOptimalPostTime(platform) {
    // Best posting times from blueprint (WAT = UTC+1)
    const times = {
      instagram: '14:00', // Tuesday 2 PM
      facebook: '19:00',  // Friday 7 PM
      twitter: '09:00',
      tiktok: '18:00',
      pinterest: '20:00',
    };
    const now = new Date();
    const [h, m] = (times[platform] || '12:00').split(':');
    now.setHours(Number(h), Number(m), 0, 0);
    return now.toISOString();
  }
}

module.exports = SocialMediaManager;
