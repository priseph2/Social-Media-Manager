'use strict';

const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { MODELS } = require('../../config/constants');
const { eventBus, EVENTS } = require('../../services/messaging/event-emitter');
const logger = require('../../utils/logger').forSkill('predictive-analytics');

// Anomaly detection thresholds
const ANOMALY_THRESHOLDS = {
  website_traffic: 0.30,    // ±30%
  engagement_rate: 0.20,    // ±20%
  email_open_rate: 0.05,    // ±5 percentage points (absolute)
  revenue: 0.25,            // ±25%
};

const SYSTEM_PROMPT = `You are a data analyst and business intelligence specialist for Cascades Luxury — a premium fragrance brand in West Africa.

You analyse performance trends, detect patterns, and provide actionable forecasts.
Your insights are used by the team to make data-driven decisions about content, campaigns, and operations.

Be specific and quantitative where possible. Identify root causes, not just symptoms.
Always frame insights in terms of business impact for a luxury retailer in West Africa.`;

const FORECAST_TOOL = {
  name: 'submit_forecast',
  description: 'Submit performance forecast and trend analysis',
  input_schema: {
    type: 'object',
    properties: {
      period: { type: 'string', description: 'e.g., "Next 30 days"' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Forecast confidence based on data quality' },
      keyTrends: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            metric: { type: 'string' },
            direction: { type: 'string', enum: ['up', 'down', 'stable', 'volatile'] },
            magnitude: { type: 'string', description: 'e.g., "+15% expected"' },
            driver: { type: 'string', description: 'What is causing this trend' },
          },
        },
      },
      channelForecasts: {
        type: 'object',
        properties: {
          social: { type: 'string' },
          email: { type: 'string' },
          website: { type: 'string' },
          ecommerce: { type: 'string' },
        },
      },
      revenueProjection: {
        type: 'object',
        properties: {
          conservative: { type: 'string' },
          base: { type: 'string' },
          optimistic: { type: 'string' },
        },
      },
      topOpportunities: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      topRisks: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      recommendedActions: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    },
    required: ['period', 'confidence', 'keyTrends', 'recommendedActions'],
  },
};

const OPTIMAL_TIMES_TOOL = {
  name: 'submit_optimal_times',
  description: 'Submit data-driven optimal posting times per platform',
  input_schema: {
    type: 'object',
    properties: {
      platforms: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            platform: { type: 'string' },
            slots: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  day: { type: 'string' },
                  time: { type: 'string' },
                  engagementIndex: { type: 'number', description: '1.0 = baseline, >1 = better' },
                  reasoning: { type: 'string' },
                },
              },
            },
          },
        },
      },
      dataQuality: { type: 'string', enum: ['empirical', 'industry_defaults', 'mixed'] },
      lastUpdated: { type: 'string' },
    },
    required: ['platforms', 'dataQuality'],
  },
};

/**
 * Generates a performance forecast from historical metrics data.
 */
async function generateForecast(historicalData, period = '30 days') {
  if (!historicalData.length) {
    return { status: 'insufficient_data', message: 'Need at least 14 days of data for forecasting' };
  }

  const dataStr = historicalData.slice(0, 60).map((m) =>
    `${m.date} | ${m.channel}: ${JSON.stringify(m.data || {})}`
  ).join('\n');

  const response = await createMessage({
    model: MODELS.PRIMARY,
    maxTokens: 2000,
    system: [cachedSystemBlock(SYSTEM_PROMPT)],
    messages: [{
      role: 'user',
      content: `Analyse this ${period} of Cascades Luxury performance data and generate a forecast:\n\n${dataStr}\n\nForecast period: Next ${period}`,
    }],
    tools: [FORECAST_TOOL],
    label: 'Predictive Analytics: forecast',
  });

  return extractToolInput(response) || { status: 'analysis_failed' };
}

/**
 * Calculates optimal posting times from historical engagement data.
 * Falls back to research-based defaults when data is sparse.
 */
async function calculateOptimalPostTimes(historicalPostData = []) {
  const hasData = historicalPostData.length >= 20;
  const dataQuality = hasData ? 'empirical' : 'industry_defaults';

  const prompt = hasData
    ? `Based on this Cascades Luxury posting history, calculate the optimal posting times per platform:\n\n${JSON.stringify(historicalPostData.slice(0, 50), null, 2)}`
    : `We have insufficient historical data. Provide optimal posting times for a West African luxury fragrance brand on Instagram, Facebook, Twitter, TikTok, and Pinterest. Base on industry research for Nigerian/Ghanaian audiences. Times should be in WAT (UTC+1).`;

  const response = await createMessage({
    model: MODELS.FAST,
    maxTokens: 800,
    system: [cachedSystemBlock(SYSTEM_PROMPT)],
    messages: [{ role: 'user', content: prompt }],
    tools: [OPTIMAL_TIMES_TOOL],
    label: 'Predictive Analytics: optimal post times',
  });

  const result = extractToolInput(response);
  if (!result) return _getDefaultPostTimes();

  return { ...result, dataQuality, lastUpdated: new Date().toISOString() };
}

/**
 * Detects anomalies in today's metrics vs 7-day rolling average.
 * Publishes events when significant changes are detected.
 */
function detectAnomalies(todayMetrics, rollingAverages = {}) {
  const anomalies = [];

  const checks = [
    { key: 'website.sessions', threshold: ANOMALY_THRESHOLDS.website_traffic, label: 'website traffic' },
    { key: 'email.avgOpenRate', threshold: ANOMALY_THRESHOLDS.email_open_rate, label: 'email open rate', absolute: true },
    { key: 'ecommerce.revenueNGN', threshold: ANOMALY_THRESHOLDS.revenue, label: 'daily revenue' },
  ];

  for (const check of checks) {
    const current = _getNestedValue(todayMetrics, check.key);
    const avg = _getNestedValue(rollingAverages, check.key);
    if (current == null || avg == null || avg === 0) continue;

    const change = check.absolute ? Math.abs(current - avg) : Math.abs((current - avg) / avg);
    const direction = current > avg ? 'spike' : 'drop';

    if (change >= check.threshold) {
      const magnitude = check.absolute
        ? `${current.toFixed(1)} vs ${avg.toFixed(1)} average`
        : `${Math.round(change * 100)}% ${direction}`;

      anomalies.push({ metric: check.label, direction, change, magnitude, current, average: avg });
      logger.warn(`Anomaly detected: ${check.label} ${direction} (${magnitude})`);
    }
  }

  if (anomalies.length) {
    eventBus.publish(EVENTS.ESCALATION_REQUIRED, {
      type: 'analytics_anomaly',
      anomalies,
      timestamp: new Date().toISOString(),
    });
  }

  return anomalies;
}

/**
 * Calculates a 7-day rolling average from historical metrics for anomaly detection.
 */
function calculateRollingAverages(metricsHistory) {
  const last7 = metricsHistory.slice(0, 7);
  if (!last7.length) return {};

  const avg = (arr) => arr.reduce((s, v) => s + (v || 0), 0) / arr.length;

  return {
    website: { sessions: avg(last7.map((m) => m.website?.sessions)) },
    email: { avgOpenRate: avg(last7.map((m) => m.email?.avgOpenRate)) },
    ecommerce: { revenueNGN: avg(last7.map((m) => m.ecommerce?.revenueNGN)) },
  };
}

function _getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function _getDefaultPostTimes() {
  return {
    platforms: [
      { platform: 'instagram', slots: [{ day: 'Tuesday', time: '14:00 WAT', engagementIndex: 1.4, reasoning: 'Peak afternoon browse time' }, { day: 'Friday', time: '19:00 WAT', engagementIndex: 1.5, reasoning: 'End-of-week lifestyle content' }] },
      { platform: 'facebook', slots: [{ day: 'Wednesday', time: '13:00 WAT', engagementIndex: 1.3, reasoning: 'Mid-week lunch scroll' }, { day: 'Sunday', time: '15:00 WAT', engagementIndex: 1.2, reasoning: 'Weekend leisure browsing' }] },
      { platform: 'twitter', slots: [{ day: 'Monday', time: '09:00 WAT', engagementIndex: 1.2, reasoning: 'Week start news consumption' }, { day: 'Thursday', time: '12:00 WAT', engagementIndex: 1.1, reasoning: 'Midday scroll' }] },
      { platform: 'tiktok', slots: [{ day: 'Tuesday', time: '18:00 WAT', engagementIndex: 1.6, reasoning: 'Post-work entertainment peak' }, { day: 'Friday', time: '20:00 WAT', engagementIndex: 1.8, reasoning: 'Weekend wind-down' }] },
      { platform: 'pinterest', slots: [{ day: 'Sunday', time: '20:00 WAT', engagementIndex: 1.4, reasoning: 'Weekend planning and inspiration' }] },
    ],
    dataQuality: 'industry_defaults',
    lastUpdated: new Date().toISOString(),
  };
}

module.exports = { generateForecast, calculateOptimalPostTimes, detectAnomalies, calculateRollingAverages };
