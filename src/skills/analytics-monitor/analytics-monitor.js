'use strict';

const BaseSkill = require('../base-skill');
const { aggregateAll, getHistoricalMetrics } = require('./data-aggregator');
const { generateForecast, calculateOptimalPostTimes, detectAnomalies, calculateRollingAverages } = require('./predictive-analytics');
const { generateReport, generateMonthlyNarrative, formatReportAsText } = require('./report-generator');
const { runBenchmarkAnalysis } = require('./competitor-benchmark');
const { predictContentPerformance } = require('./content-predictor');
const { attributeOrder, getTopAttributedContent } = require('./revenue-attributor');
const { getBrandConfig } = require('../../services/brand-config');
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
      case 'aggregate-daily-metrics':    return this.aggregateDailyMetrics(job);
      case 'generate-report':            return this.generateReport(job);
      case 'generate-monthly-report':    return this.generateMonthlyReport(job);
      case 'forecast-performance':       return this.forecastPerformance(job);
      case 'get-optimal-post-times':     return this.getOptimalPostTimes(job);
      case 'analyse-sales-spike':        return this.analyseSalesSpike(job);
      case 'get-content-insights':       return this.getContentInsights(job);
      case 'benchmark-performance':      return this.benchmarkPerformance(job);
      case 'run-competitor-benchmark':   return this.runCompetitorBenchmark(job);
      case 'predict-content-performance':return this.predictContentPerformance(job);
      case 'attribute-revenue':          return this.attributeRevenue(job);
      default:
        throw new Error(`Analytics Monitor: unknown job "${job.name}"`);
    }
  }

  // ── Aggregate Daily Metrics ────────────────────────────────────────────────

  async aggregateDailyMetrics(job) {
    const date = new Date(job.data.date || Date.now());
    const tenantId = job.data.tenantId || null;
    this.log.info(`Aggregating daily metrics for ${date.toISOString().split('T')[0]}`, { jobId: job.id, tenantId });

    const aggregated = await aggregateAll(date, tenantId);

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
    const history = await getHistoricalMetrics(7, null, tenantId);
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
    const tenantId = job.data.tenantId || null;
    this.log.info(`Generating ${type} report: ${period}`, { jobId: job.id, tenantId });

    const days = type === 'monthly' ? 30 : 7;
    const [history, brandConfig] = await Promise.all([
      getHistoricalMetrics(days, null, tenantId),
      getBrandConfig(tenantId),
    ]);

    const metricsByDate = history.reduce((acc, m) => {
      const d = m.date?.toISOString?.()?.split('T')[0] || 'unknown';
      if (!acc[d]) acc[d] = {};
      acc[d][m.channel] = m.data;
      return acc;
    }, {});

    const emailCampaigns = await supabaseQuery((db) => {
      let q = db.from('email_campaigns')
        .select('subject, status, open_rate, click_rate, revenue_ngn, sent_at')
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(10);
      if (tenantId) q = q.eq('tenant_id', tenantId);
      return q;
    }) || [];

    const reportData = { metricsByDate, emailCampaigns, period, type };

    const forecast = await generateForecast(history, '7 days');
    const report = await generateReport(reportData, period, forecast, brandConfig, null);

    const result = { ...report, forecast, type, jobId: job.id };
    if (includeText) result.textBriefing = formatReportAsText(report);
    return result;
  }

  // ── Full Monthly Narrative Report ─────────────────────────────────────────

  async generateMonthlyReport(job) {
    const { period } = job.data;  // 'YYYY-MM' or free-text
    const tenantId = job.data.tenantId || null;
    const reportPeriod = period || new Date().toISOString().slice(0, 7);
    this.log.info(`Generating monthly narrative report: ${reportPeriod}`, { jobId: job.id, tenantId });

    const [history, brandConfig] = await Promise.all([
      getHistoricalMetrics(30, null, tenantId),
      getBrandConfig(tenantId),
    ]);

    const emailCampaigns = await supabaseQuery((db) => {
      let q = db.from('email_campaigns')
        .select('subject, status, open_rate, click_rate, revenue_ngn, sent_at')
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(20);
      if (tenantId) q = q.eq('tenant_id', tenantId);
      return q;
    }) || [];

    // Get period aggregated snapshot (latest day in history)
    const aggregated = history.length
      ? history.reduce((acc, m) => {
          acc[m.channel] = m.data;
          return acc;
        }, {})
      : {};

    // Competitor benchmark
    const industry = brandConfig?.identity?.positioning || 'Retail';
    let benchmark = null;
    try {
      benchmark = await runBenchmarkAnalysis(aggregated, industry, brandConfig?.identity?.name);
    } catch {
      this.log.warn('Benchmark analysis failed — continuing without it');
    }

    // Top performing content
    let topContent = [];
    let topAttributed = [];
    if (isMongoAvailable()) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const filter = { postedAt: { $gte: since }, 'brandReview.status': 'approved' };
      if (tenantId) filter.tenantId = tenantId;
      topContent = await Content.find(filter)
        .sort({ 'performance.engagementRate': -1 })
        .limit(10)
        .lean();
      topAttributed = await getTopAttributedContent(tenantId, 30);
    }

    const forecast = await generateForecast(history, '30 days').catch(() => null);

    const narrative = await generateMonthlyNarrative({
      period: reportPeriod,
      metricsHistory: history,
      aggregated,
      emailCampaigns,
      forecast,
      benchmark,
      topContent,
      topAttributed,
      brandConfig,
    });

    // Also generate structured summary for the report card
    const structured = await generateReport(
      { metricsByDate: {}, emailCampaigns, period: reportPeriod, type: 'monthly' },
      reportPeriod,
      forecast,
      brandConfig,
      benchmark
    ).catch(() => null);

    // Persist to Supabase monthly_reports table
    await supabaseQuery((db) =>
      db.from('monthly_reports').upsert({
        tenant_id: tenantId,
        period: reportPeriod,
        title: `${brandConfig?.identity?.name || 'Performance'} Report — ${reportPeriod}`,
        markdown: narrative.markdown,
        structured,
        benchmark,
        overall_score: structured?.overallScore?.score || null,
      }, { onConflict: 'tenant_id,period' })
    ).catch((err) => this.log.warn('Failed to persist monthly report', { error: err.message }));

    return {
      success: true,
      period: reportPeriod,
      wordCount: narrative.wordCount,
      overallScore: structured?.overallScore?.score,
      jobId: job.id,
    };
  }

  // ── Forecast ───────────────────────────────────────────────────────────────

  async forecastPerformance(job) {
    const { period = '30 days' } = job.data;
    const tenantId = job.data.tenantId || null;
    this.log.info(`Generating ${period} forecast`, { jobId: job.id, tenantId });
    const history = await getHistoricalMetrics(60, null, tenantId);
    const forecast = await generateForecast(history, period);
    return { ...forecast, period, jobId: job.id };
  }

  // ── Optimal Post Times ──────────────────────────────────────────────────────

  async getOptimalPostTimes(job) {
    const tenantId = job.data.tenantId || null;
    const cacheKey = tenantId || '__default__';
    const cached = this._optimalPostTimesCache?.[cacheKey];
    const cacheAge = cached ? Date.now() - cached.cachedAt : Infinity;

    if (cached && cacheAge < 24 * 60 * 60 * 1000) {
      return { ...cached.result, fromCache: true, jobId: job.id };
    }

    // Pull posting history scoped to this tenant
    const postHistory = await supabaseQuery((db) => {
      let q = db.from('content_schedule')
        .select('platform, scheduled_at, status')
        .eq('status', 'posted')
        .order('scheduled_at', { ascending: false })
        .limit(200);
      if (tenantId) q = q.eq('tenant_id', tenantId);
      return q;
    }) || [];

    const result = await calculateOptimalPostTimes(postHistory);
    if (!this._optimalPostTimesCache) this._optimalPostTimesCache = {};
    this._optimalPostTimesCache[cacheKey] = { result, cachedAt: Date.now() };

    return { ...result, jobId: job.id };
  }

  // ── Sales Spike Analysis ───────────────────────────────────────────────────

  async analyseSalesSpike(job) {
    const { source, order } = job.data;
    const tenantId = job.data.tenantId || null;
    this.log.info('Analysing sales spike', { source, jobId: job.id, tenantId });

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // Look for correlated events scoped to this tenant
    const [recentContent, recentCampaigns] = await Promise.all([
      isMongoAvailable()
        ? Content.find({
            ...(tenantId && { tenantId }),
            postedAt: { $gte: cutoff },
          })
            .select('type platform postedAt')
            .limit(10)
            .lean()
        : [],
      supabaseQuery((db) => {
        let q = db.from('email_campaigns')
          .select('subject, sent_at, open_rate')
          .eq('status', 'sent')
          .gte('sent_at', cutoff.toISOString());
        if (tenantId) q = q.eq('tenant_id', tenantId);
        return q;
      }) || [],
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
    const tenantId = job.data.tenantId || null;

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
    if (tenantId) filter.tenantId = tenantId;
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

  // ── Competitor Benchmark ───────────────────────────────────────────────────

  async runCompetitorBenchmark(job) {
    const tenantId = job.data.tenantId || null;
    this.log.info('Running competitor benchmark', { jobId: job.id, tenantId });

    const [history, brandConfig] = await Promise.all([
      getHistoricalMetrics(7, null, tenantId),
      getBrandConfig(tenantId),
    ]);

    const aggregated = history.reduce((acc, m) => {
      acc[m.channel] = m.data;
      return acc;
    }, {});

    const industry = brandConfig?.identity?.positioning || 'Retail';
    const brandName = brandConfig?.identity?.name || 'Your brand';
    const benchmark = await runBenchmarkAnalysis(aggregated, industry, brandName);

    return { ...benchmark, jobId: job.id };
  }

  // ── Content Performance Prediction ────────────────────────────────────────

  async predictContentPerformance(job) {
    const { contentText, platform, scheduledAt, contentId } = job.data;
    const tenantId = job.data.tenantId || null;
    this.log.info(`Predicting content performance: ${platform}`, { jobId: job.id, tenantId });

    const [brandConfig, historicalContent] = await Promise.all([
      getBrandConfig(tenantId),
      isMongoAvailable()
        ? Content.find({
            ...(tenantId ? { tenantId } : {}),
            platform,
            'brandReview.status': 'approved',
            'performance.engagementRate': { $exists: true },
          })
            .sort({ postedAt: -1 })
            .limit(30)
            .lean()
        : [],
    ]);

    const prediction = await predictContentPerformance({
      contentText,
      platform,
      scheduledAt,
      historicalContent,
      brandConfig,
      tenantId,
      contentId,
    });

    // If a contentId was provided, store prediction on the Content document
    if (contentId && isMongoAvailable()) {
      await Content.findByIdAndUpdate(contentId, {
        performancePrediction: {
          predictedEngagementRate: prediction.predictedEngagementRate,
          predictedReach: prediction.predictedReach,
          viralPotential: prediction.viralPotential,
          confidence: prediction.confidence,
          keyStrengths: prediction.keyStrengths,
          improvementSuggestions: prediction.improvementSuggestions,
          generatedAt: new Date(),
        },
      }).catch(() => {});
    }

    return { ...prediction, jobId: job.id };
  }

  // ── Revenue Attribution ───────────────────────────────────────────────────

  async attributeRevenue(job) {
    const { order, platform = 'shopify' } = job.data;
    const tenantId = job.data.tenantId || null;
    this.log.info(`Attributing revenue for order ${order?.id}`, { jobId: job.id, tenantId });

    const attribution = await attributeOrder(order, tenantId, platform);

    return {
      success: Boolean(attribution),
      orderId: order?.id,
      attribution,
      jobId: job.id,
    };
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
