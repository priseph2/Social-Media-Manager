'use strict';

const BaseSkill = require('../base-skill');
const { SKILLS } = require('../../config/constants');
const ga4 = require('../../services/api-clients/google-analytics');
const { isMongoAvailable } = require('../../services/database/mongodb-client');
const Metrics = require('../../models/metrics.model');
const { eventBus, EVENTS } = require('../../services/messaging/event-emitter');

/**
 * SKILL 5: Analytics Monitor
 * Status: STUB — data models ready, API connections wired.
 *
 * Job types handled:
 *   - aggregate-daily-metrics → collects all channel data and stores in Metrics model
 *   - analyse-sales-spike     → investigates a detected revenue spike
 *   - generate-report         → builds a human-readable performance report
 *   - get-optimal-post-times  → returns best posting times based on engagement history
 */
class AnalyticsMonitor extends BaseSkill {
  constructor() {
    super(SKILLS.ANALYTICS_MONITOR);
  }

  async execute(job) {
    switch (job.name) {
      case 'aggregate-daily-metrics':
        return this.aggregateDailyMetrics(job);
      case 'analyse-sales-spike':
        return this.analyseSalesSpike(job);
      case 'generate-report':
        return this.generateReport(job);
      case 'get-optimal-post-times':
        return this.getOptimalPostTimes(job);
      default:
        throw new Error(`Analytics Monitor: unknown job "${job.name}"`);
    }
  }

  async aggregateDailyMetrics(job) {
    const date = new Date(job.data.date || Date.now());
    this.log.info('Aggregating daily metrics', { date: date.toISOString(), jobId: job.id });

    // TODO (Phase 5): Pull from GA4, Buffer, Mailchimp, Tidio APIs in parallel
    const [websiteData] = await Promise.all([
      ga4.getActiveUsers({ startDate: date.toISOString().split('T')[0], endDate: date.toISOString().split('T')[0] }),
    ]);

    // Store placeholder metrics if MongoDB is available
    if (isMongoAvailable() && websiteData) {
      await Metrics.findOneAndUpdate(
        { date, channel: 'website' },
        { date, channel: 'website', data: websiteData },
        { upsert: true, new: true }
      );
    }

    return { aggregated: true, date: date.toISOString(), jobId: job.id };
  }

  async analyseSalesSpike(job) {
    this.log.info('Analysing sales spike', { jobId: job.id });
    // TODO (Phase 5): Correlate spike with content performance, traffic source
    return { status: 'pending_implementation', jobId: job.id };
  }

  async generateReport(job) {
    this.log.info('Generating performance report', { jobId: job.id });
    // TODO (Phase 5): Aggregate all channels → Claude generates narrative report
    return { status: 'pending_implementation', jobId: job.id };
  }

  async getOptimalPostTimes(job) {
    // Defaults based on research (WAT) — will be data-driven in Phase 5
    return {
      instagram: [{ day: 'Tuesday', time: '14:00' }, { day: 'Friday', time: '19:00' }],
      facebook: [{ day: 'Wednesday', time: '13:00' }, { day: 'Sunday', time: '15:00' }],
      twitter: [{ day: 'Monday', time: '09:00' }, { day: 'Thursday', time: '12:00' }],
      tiktok: [{ day: 'Tuesday', time: '18:00' }, { day: 'Friday', time: '20:00' }],
    };
  }
}

module.exports = AnalyticsMonitor;
