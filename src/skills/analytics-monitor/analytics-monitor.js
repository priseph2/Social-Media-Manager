'use strict';

const BaseSkill = require('../base-skill');
const { aggregateAll, getHistoricalMetrics } = require('./data-aggregator');
const { generateForecast, calculateOptimalPostTimes, detectAnomalies, calculateRollingAverages } = require('./predictive-analytics');
const { generateReport, formatReportAsText } = require('./report-generator');
const { isMongoAvailable } = require('../../services/database/mongodb-client');
const { supabaseQuery } = require('../../services/database/supabase-client');
const Metrics = require('../../models/metrics.model');
const Content = require('../../models/content.model');
const { SKILLS, MODELS } = require('../../config/constants');

/**
 * SKILL 5: Analytics Monitor — Phase 4 (Fully Implemented)
 *
 * The memory and intelligence layer of the entire AI system.
 * Provides performance data to all other skills and surfaces insights
 * for the human manager.
 *
 * Job types:
 *   aggregate-daily-metrics  → collect all channel data, detect anomalies, store
 *   generate-report          → Claude narrative performance briefing (weekly/monthly)
 *   forecast-performance     → predict next period metrics from historical data
 *   get-optimal-post-times   → data-driven posting schedule per platform
 *   analyse-sales-spike      → investigate a revenue anomaly
 *   get-content-insights     → what content angles/formats are performing best
 *   benchmark-performance    → compare metrics against industry targets
 */
class AnalyticsMonitor extends BaseSkill {
  constructor() {
    super(SKILLS.ANALYTICS_MONITOR);
    // Cache optimal post times to avoid re-computing every request
    this._optimalPostTimesCache = null;
    this._optimalPostTimesCachedAt = null;
  }

  async execute(job) {
    switch (job.name) {
      case 'aggregate-daily-metrics':
        return this.aggregateDailyMetrics(job);
      case 'generate-report':
        return this.generateReport(job);
      case 'forecast-performance':
        return this.forecastPerformance(job);
      case 'get-optimal-post-times':
        return this.getOptimalPostTimes(job);
      case 'analyse-sales-spike':
        return this.analyseSalesSpike(job);
      case 'get-content-insights':
        return this.getContentInsights(job);
      case 'benchmark-performance':
        return this.benchmarkPerformance(job);
      default:
        throw new Error(`Analytics Monitor: unknown job "${job.name}"`);
    }
  }

  // ── Aggregate Daily Metrics ────────────────────────────────────────────────

  async aggregateDailyMetrics(job) {
    const date = new Date(job.data.date || Date.now());
    this.log.info(`Aggregating daily metrics for ${date.toISOString().split('T')[0]}`, { jobId: job.id });

    const aggregated = await aggregateAll(date);

    // Persist to MongoDB by channel
    if (isMongoAvailable()) {
      const channels = ['website', 'social', 'email', 'customerService', 'ecommerce'];
      await Promise.all(
        channels.map((ch) =>
          Metrics.findOneAndUpdate(
            { date, channel: ch === 'customerService' ? 'customer_service' : ch },
            {
              date,
              channel: ch === 'customerService' ? 'customer_service' : ch,
              data: aggregated[ch],
              reach: aggregated[ch]?.sessions || aggregated[ch]?.totalReach,
              revenue: ch === 'ecommerce' ? aggregated.ecommerce?.revenueNGN : null,
            },
            { upsert: true, new: true }
          ).catch((err) => this.log.warn(`Failed to upsert metrics for ${ch}`, { error: err }))
        )
      );
    }

    // Persist normalised rows to Supabase daily_metrics
    await this._persistToSupabase(date, aggregated);

    // Detect anomalies vs 7-day rolling average
    const history = await getHistoricalMetrics(7);
    const rolling = calculateRollingAverages(
      history.reduce((acc, m) => {
        const dateKey = m.date?.toISOString?.()?.split('T')[0] || '';
        if (!acc.find((r) => r.date === dateKey && r.channel === m.channel)) {
          acc.push({ date: dateKey, channel: m.channel, ...m.data });
        }
        return acc;
      }, [])
    );
    const anomalies = detectAnomalies(aggregated, rolling);

    this.log.info('Daily aggregation complete', {
      jobId: job.id,
      anomalies: anomalies.length,
      channels: Object.keys(aggregated).filter((k) => !['date', 'aggregatedAt', 'totals'].includes(k)),
    });

    return {
      success: true,
      date: aggregated.date,
      anomalies,
      totals: aggregated.totals,
      jobId: job.id,
    };
  }

  // ── Generate Performance Report ────────────────────────────────────────────

  async generateReport(job) {
    const { period = 'Last 7 days', type = 'weekly', includeText = true } = job.data;
    this.log.info(`Generating ${type} report: ${period}`, { jobId: job.id });

    // Pull recent aggregated data
    const days = type === 'monthly' ? 30 : 7;
    const history = await getHistoricalMetrics(days);

    // Group metrics by date for the report
    const metricsByDate = history.reduce((acc, m) => {
      const d = m.date?.toISOString?.()?.split('T')[0] || 'unknown';
      if (!acc[d]) acc[d] = {};
      acc[d][m.channel] = m.data;
      return acc;
    }, {});

    // Get email campaigns from Supabase for this period
    const emailCampaigns = await supabaseQuery((db) =>
      db.from('email_campaigns')
        .select('subject, status, open_rate, click_rate, revenue_ngn, sent_at')
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(10)
    ) || [];

    const reportData = { metricsByDate, emailCampaigns, period, type };

    const forecast = await generateForecast(history, '7 days');
    const report = await generateReport(reportData, period, forecast);

    const result = {
      ...report,
      forecast,
      type,
      jobId: job.id,
    };

    if (includeText) {
      result.textBriefing = formatReportAsText(report);
    }

    return result;
  }

  // ── Forecast ───────────────────────────────────────────────────────────────

  async forecastPerformance(job) {
    const { period = '30 days' } = job.data;
    this.log.info(`Generating ${period} forecast`, { jobId: job.id });
    const history = await getHistoricalMetrics(60);
    const forecast = await generateForecast(history, period);
    return { ...forecast, period, jobId: job.id };
  }

  // ── Optimal Post Times ──────────────────────────────────────────────────────

  async getOptimalPostTimes(job) {
    // Return cached result if less than 24 hours old
    const cacheAge = this._optimalPostTimesCachedAt
      ? Date.now() - this._optimalPostTimesCachedAt
      : Infinity;

    if (this._optimalPostTimesCache && cacheAge < 24 * 60 * 60 * 1000) {
      return { ...this._optimalPostTimesCache, fromCache: true, jobId: job.id };
    }

    // Pull posting history from Supabase
    const postHistory = await supabaseQuery((db) =>
      db.from('content_schedule')
        .select('platform, scheduled_at, status')
        .eq('status', 'posted')
        .order('scheduled_at', { ascending: false })
        .limit(200)
    ) || [];

    const result = await calculateOptimalPostTimes(postHistory);
    this._optimalPostTimesCache = result;
    this._optimalPostTimesCachedAt = Date.now();

    return { ...result, jobId: job.id };
  }

  // ── Sales Spike Analysis ───────────────────────────────────────────────────

  async analyseSalesSpike(job) {
    const { source, order } = job.data;
    this.log.info('Analysing sales spike', { source, jobId: job.id });

    // Look for correlated events (recent content, email campaigns)
    const [recentContent, recentCampaigns] = await Promise.all([
      isMongoAvailable()
        ? Content.find({ postedAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } })
            .select('type platform postedAt')
            .limit(10)
            .lean()
        : [],
      supabaseQuery((db) =>
        db.from('email_campaigns')
          .select('subject, sent_at, open_rate')
          .eq('status', 'sent')
          .gte('sent_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      ) || [],
    ]);

    return {
      spikeDetected: true,
      source,
      possibleCorrelations: {
        recentContent: recentContent.map((c) => `${c.type} on ${c.platform}`),
        recentCampaigns: recentCampaigns.map((c) => c.subject),
      },
      recommendation: recentCampaigns.length
        ? `Email campaign "${recentCampaigns[0]?.subject}" likely drove this spike. Scale similar campaigns.`
        : 'Investigate traffic source in GA4 to identify the spike driver.',
      jobId: job.id,
    };
  }

  // ── Content Insights ───────────────────────────────────────────────────────

  /**
   * Returns insights about what content is performing best.
   * Called by Content Generator before creating new content.
   */
  async getContentInsights(job) {
    const { platform, days = 30 } = job.data;

    if (!isMongoAvailable()) {
      return {
        topAngles: ['product storytelling', 'educational fragrance tips', 'lifestyle aspirational'],
        topFormats: ['carousel', 'single image with long caption'],
        avgEngagementRate: null,
        recommendation: 'No data yet — using best-practice defaults',
        jobId: job.id,
      };
    }

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const filter = { createdAt: { $gte: cutoff }, 'brandReview.status': 'approved' };
    if (platform) filter.platform = platform;

    const content = await Content.find(filter)
      .sort({ 'performance.engagementRate': -1 })
      .limit(20)
      .select('type platform performance brandReview.qualityScore')
      .lean();

    const topEngagementRate = content[0]?.performance?.engagementRate;
    const avgEngagementRate = content.length
      ? content.reduce((s, c) => s + (c.performance?.engagementRate || 0), 0) / content.length
      : null;

    return {
      topContent: content.slice(0, 5),
      avgEngagementRate,
      topEngagementRate,
      topTypes: [...new Set(content.slice(0, 5).map((c) => c.type))],
      recommendation: topEngagementRate
        ? `Top posts achieving ${topEngagementRate.toFixed(1)}% engagement. Replicate their patterns.`
        : 'Build content history to unlock data-driven recommendations.',
      jobId: job.id,
    };
  }

  // ── Benchmark ──────────────────────────────────────────────────────────────

  async benchmarkPerformance(job) {
    const targets = {
      instagram_engagement: { target: 3.5, unit: '%', label: 'Instagram engagement rate' },
      email_open_rate: { target: 22, unit: '%', label: 'Email open rate' },
      email_click_rate: { target: 2.5, unit: '%', label: 'Email click rate' },
      cs_response_time: { target: 120, unit: 'min', label: 'Customer service response time' },
      cs_resolution_rate: { target: 80, unit: '%', label: 'CS first-contact resolution' },
      ecommerce_conversion: { target: 1, unit: '%', label: 'E-commerce conversion rate' },
    };

    const current = job.data.currentMetrics || {};
    const benchmark = Object.entries(targets).map(([key, config]) => ({
      metric: config.label,
      target: `${config.target}${config.unit}`,
      current: current[key] ? `${current[key]}${config.unit}` : 'No data yet',
      status: current[key]
        ? current[key] >= config.target ? 'on_target' : 'below_target'
        : 'no_data',
    }));

    return { benchmark, jobId: job.id };
  }

  // ── Helper ─────────────────────────────────────────────────────────────────

  async _persistToSupabase(date, aggregated) {
    const rows = [
      { metric_date: date, channel: 'website', metric_key: 'sessions', value: aggregated.website?.sessions },
      { metric_date: date, channel: 'email', metric_key: 'avg_open_rate', value: aggregated.email?.avgOpenRate },
      { metric_date: date, channel: 'email', metric_key: 'campaigns_sent', value: aggregated.email?.campaignsSent },
      { metric_date: date, channel: 'ecommerce', metric_key: 'revenue_ngn', value: aggregated.ecommerce?.revenueNGN },
      { metric_date: date, channel: 'ecommerce', metric_key: 'orders', value: aggregated.ecommerce?.ordersCount },
      { metric_date: date, channel: 'customer_service', metric_key: 'inquiries', value: aggregated.customerService?.totalInquiries },
      { metric_date: date, channel: 'social', metric_key: 'posts_published', value: aggregated.social?.postsPublished },
    ].filter((r) => r.value != null);

    if (!rows.length) return;

    await supabaseQuery((db) =>
      db.from('daily_metrics').upsert(rows, { onConflict: 'metric_date,channel,metric_key' })
    );
  }
}

module.exports = AnalyticsMonitor;
