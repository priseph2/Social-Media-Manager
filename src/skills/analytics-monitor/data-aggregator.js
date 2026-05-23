'use strict';

/**
 * Data Aggregator — pulls raw metrics from all connected APIs in parallel
 * and normalises them into a standard shape for storage and analysis.
 * Each aggregator method is independently safe — a missing API key
 * returns empty data rather than throwing.
 */

const ga4 = require('../../services/api-clients/google-analytics');
const mailchimpApi = require('../../services/api-clients/mailchimp-api');
const shopifyApi = require('../../services/api-clients/shopify-api');
const { supabaseQuery } = require('../../services/database/supabase-client');
const { isMongoAvailable } = require('../../services/database/mongodb-client');
const Content = require('../../models/content.model');
const Decision = require('../../models/decision.model');
const logger = require('../../utils/logger').forSkill('data-aggregator');

/**
 * Aggregates all channel metrics for a given date.
 * Returns a structured object that Analytics Monitor stores.
 */
async function aggregateAll(date = new Date()) {
  const dateStr = date.toISOString().split('T')[0];
  logger.info(`Aggregating all metrics for ${dateStr}`);

  const [website, social, email, customerService, ecommerce] = await Promise.all([
    aggregateWebsite(dateStr),
    aggregateSocial(dateStr),
    aggregateEmail(dateStr),
    aggregateCustomerService(dateStr),
    aggregateEcommerce(dateStr),
  ]);

  return {
    date: dateStr,
    aggregatedAt: new Date().toISOString(),
    website,
    social,
    email,
    customerService,
    ecommerce,
    // Cross-channel summary for quick querying
    totals: {
      reach: (social.totalReach || 0) + (email.delivered || 0) + (website.sessions || 0),
      engagements: (social.totalEngagements || 0) + (email.clicks || 0),
      revenue: ecommerce.revenueNGN || 0,
    },
  };
}

async function aggregateWebsite(dateStr) {
  const [activeUsers, topPages] = await Promise.all([
    ga4.getActiveUsers({ startDate: dateStr, endDate: dateStr }),
    ga4.getTopPages({ startDate: dateStr, endDate: dateStr }),
  ]);

  return {
    sessions: activeUsers?.activeUsers || null,
    topPages: topPages || [],
    dataSource: 'google_analytics_4',
    available: Boolean(process.env.GA4_PROPERTY_ID),
  };
}

async function aggregateSocial(dateStr) {
  // Pull from Supabase content_schedule (posted today)
  const posts = await supabaseQuery((db) =>
    db.from('content_schedule')
      .select('platform, content_type, status')
      .eq('status', 'posted')
      .gte('posted_at', `${dateStr}T00:00:00Z`)
      .lte('posted_at', `${dateStr}T23:59:59Z`)
  ) || [];

  const byPlatform = posts.reduce((acc, p) => {
    acc[p.platform] = (acc[p.platform] || 0) + 1;
    return acc;
  }, {});

  return {
    postsPublished: posts.length,
    byPlatform,
    totalReach: null,    // populated when Buffer Analytics is configured
    totalEngagements: null,
    dataSource: 'supabase_content_schedule',
  };
}

async function aggregateEmail(dateStr) {
  const campaigns = await supabaseQuery((db) =>
    db.from('email_campaigns')
      .select('subject, status, open_rate, click_rate, revenue_ngn')
      .gte('sent_at', `${dateStr}T00:00:00Z`)
      .lte('sent_at', `${dateStr}T23:59:59Z`)
  ) || [];

  const totalRevenue = campaigns.reduce((sum, c) => sum + (c.revenue_ngn || 0), 0);
  const avgOpenRate = campaigns.length
    ? campaigns.reduce((sum, c) => sum + (c.open_rate || 0), 0) / campaigns.length
    : null;

  return {
    campaignsSent: campaigns.length,
    avgOpenRate,
    avgClickRate: campaigns.length
      ? campaigns.reduce((sum, c) => sum + (c.click_rate || 0), 0) / campaigns.length
      : null,
    revenueNGN: totalRevenue,
    campaigns,
    dataSource: 'supabase_email_campaigns',
  };
}

async function aggregateCustomerService(dateStr) {
  if (!isMongoAvailable()) return { available: false };

  const cutoff = new Date(`${dateStr}T00:00:00Z`);
  const end = new Date(`${dateStr}T23:59:59Z`);

  const [totalDecisions, escalatedDecisions] = await Promise.all([
    Decision.countDocuments({ skill: 'customer-service-agent', createdAt: { $gte: cutoff, $lte: end } }),
    Decision.countDocuments({ skill: 'customer-service-agent', escalated: true, createdAt: { $gte: cutoff, $lte: end } }),
  ]);

  const decisions = await Decision.find({
    skill: 'customer-service-agent',
    createdAt: { $gte: cutoff, $lte: end },
  }).select('durationMs output.sentiment').lean();

  const avgResponseMs = decisions.length
    ? decisions.reduce((sum, d) => sum + (d.durationMs || 0), 0) / decisions.length
    : null;

  return {
    totalInquiries: totalDecisions,
    escalated: escalatedDecisions,
    escalationRate: totalDecisions ? (escalatedDecisions / totalDecisions) : null,
    avgResponseTimeMs: avgResponseMs,
    dataSource: 'mongodb_decisions',
    available: true,
  };
}

async function aggregateEcommerce(dateStr) {
  const orders = await shopifyApi.getOrders({ status: 'any', limit: 250 });
  if (!orders.length) return { available: Boolean(process.env.SHOPIFY_ACCESS_TOKEN), dataSource: 'shopify' };

  const todayOrders = orders.filter((o) => o.created_at?.startsWith(dateStr));
  const totalRevenue = todayOrders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
  const aov = todayOrders.length ? totalRevenue / todayOrders.length : 0;

  return {
    ordersCount: todayOrders.length,
    revenueNGN: totalRevenue,
    aov,
    dataSource: 'shopify',
    available: true,
  };
}

/**
 * Retrieves the last N days of aggregated metrics from MongoDB
 * for trend analysis and forecasting.
 */
async function getHistoricalMetrics(days = 30, channel = null) {
  if (!isMongoAvailable()) return [];
  const Metrics = require('../../models/metrics.model');
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const filter = { date: { $gte: cutoff } };
  if (channel) filter.channel = channel;
  return Metrics.find(filter).sort({ date: -1 }).limit(days * 5).lean();
}

module.exports = { aggregateAll, aggregateWebsite, aggregateSocial, aggregateEmail, getHistoricalMetrics };
