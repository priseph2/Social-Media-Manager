'use strict';

/**
 * Data Aggregator — pulls raw metrics from all connected APIs in parallel
 * and normalises them into a standard shape for storage and analysis.
 *
 * Every aggregator method is independently safe; missing credentials
 * return empty data rather than throwing.
 *
 * Each method accepts a tenantId so multi-tenant credential lookup works
 * correctly via the credential store.
 */

const ga4 = require('../../services/api-clients/google-analytics');
const tidio = require('../../services/api-clients/tidio-api');
const mailchimpApi = require('../../services/api-clients/mailchimp-api');
const { getEcommerceAdapter } = require('../../services/ecommerce');
const { getCredentials } = require('../../services/credential-store');
const { supabaseQuery } = require('../../services/database/supabase-client');
const { isMongoAvailable } = require('../../services/database/mongodb-client');
const Content = require('../../models/content.model');
const Decision = require('../../models/decision.model');
const logger = require('../../utils/logger').forSkill('data-aggregator');

/**
 * Aggregates all channel metrics for a given date and tenant.
 * tenantId is optional; when absent the system falls back to env-var singletons
 * (backwards-compatible with legacy single-tenant operation).
 */
async function aggregateAll(date = new Date(), tenantId = null) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error(`aggregateAll: invalid date value: ${date}`);
  }
  const dateStr = date.toISOString().split('T')[0];
  logger.info(`Aggregating all metrics for ${dateStr}`, { tenantId });

  const [website, social, email, customerService, ecommerce] = await Promise.all([
    aggregateWebsite(dateStr, tenantId),
    aggregateSocial(dateStr, tenantId),
    aggregateEmail(dateStr, tenantId),
    aggregateCustomerService(dateStr, tenantId),
    aggregateEcommerce(dateStr, tenantId),
  ]);

  return {
    date: dateStr,
    aggregatedAt: new Date().toISOString(),
    tenantId,
    website,
    social,
    email,
    customerService,
    ecommerce,
    totals: {
      reach: (social.totalReach || 0) + (email.delivered || 0) + (website.sessions || 0),
      engagements: (social.totalEngagements || 0) + (email.clicks || 0),
      revenue: ecommerce.revenue || ecommerce.revenueNGN || 0,
    },
  };
}

// ── Channel aggregators ────────────────────────────────────────────────────

async function aggregateWebsite(dateStr, tenantId) {
  // Resolve per-tenant GA4 credentials if available
  let ga4Creds = {};
  if (tenantId) {
    const stored = await getCredentials(tenantId, 'ga4').catch(() => null);
    if (stored) {
      ga4Creds = {
        propertyId: stored.propertyId,
        clientEmail: stored.clientEmail,
        privateKey: stored.privateKey,
      };
    }
  }

  const [activeUsers, topPages] = await Promise.all([
    ga4.getActiveUsers({ startDate: dateStr, endDate: dateStr }, ga4Creds),
    ga4.getTopPages({ startDate: dateStr, endDate: dateStr }, ga4Creds),
  ]);

  return {
    sessions: activeUsers?.sessions ?? activeUsers?.activeUsers ?? null,
    activeUsers: activeUsers?.activeUsers ?? null,
    pageViews: activeUsers?.pageViews ?? null,
    topPages: topPages || [],
    dataSource: 'google_analytics_4',
    available: ga4._isConfigured(ga4Creds),
  };
}

async function aggregateSocial(dateStr, tenantId) {
  const filter = (db) => {
    let q = db.from('content_schedule')
      .select('platform, content_type, status')
      .eq('status', 'posted')
      .gte('posted_at', `${dateStr}T00:00:00Z`)
      .lte('posted_at', `${dateStr}T23:59:59Z`);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    return q;
  };

  const posts = await supabaseQuery(filter) || [];

  const byPlatform = posts.reduce((acc, p) => {
    acc[p.platform] = (acc[p.platform] || 0) + 1;
    return acc;
  }, {});

  return {
    postsPublished: posts.length,
    byPlatform,
    totalReach: null,
    totalEngagements: null,
    dataSource: 'supabase_content_schedule',
  };
}

async function aggregateEmail(dateStr, tenantId) {
  const filter = (db) => {
    let q = db.from('email_campaigns')
      .select('subject, status, open_rate, click_rate, revenue_ngn')
      .gte('sent_at', `${dateStr}T00:00:00Z`)
      .lte('sent_at', `${dateStr}T23:59:59Z`);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    return q;
  };

  const campaigns = await supabaseQuery(filter) || [];

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

async function aggregateCustomerService(dateStr, tenantId) {
  const cutoff = new Date(`${dateStr}T00:00:00Z`);
  const end = new Date(`${dateStr}T23:59:59Z`);

  // MongoDB decisions
  let mongoData = { available: false };
  if (isMongoAvailable()) {
    const baseFilter = { skill: 'customer-service-agent', createdAt: { $gte: cutoff, $lte: end } };
    if (tenantId) baseFilter.tenantId = tenantId;

    const [totalDecisions, escalatedDecisions, decisions] = await Promise.all([
      Decision.countDocuments(baseFilter),
      Decision.countDocuments({ ...baseFilter, escalated: true }),
      Decision.find(baseFilter).select('durationMs output.sentiment').lean(),
    ]);

    const avgResponseMs = decisions.length
      ? decisions.reduce((sum, d) => sum + (d.durationMs || 0), 0) / decisions.length
      : null;

    mongoData = {
      totalInquiries: totalDecisions,
      escalated: escalatedDecisions,
      escalationRate: totalDecisions ? escalatedDecisions / totalDecisions : null,
      avgResponseTimeMs: avgResponseMs,
      dataSource: 'mongodb_decisions',
      available: true,
    };
  }

  // Tidio live-chat open conversation count
  let tidioData = {};
  try {
    const openConversations = await tidio.getOpenConversations('open');
    tidioData = {
      tidioOpenConversations: openConversations.length,
      tidioAvailable: true,
    };
  } catch {
    tidioData = { tidioAvailable: false };
  }

  return { ...mongoData, ...tidioData };
}

async function aggregateEcommerce(dateStr, tenantId) {
  try {
    let orders = [];

    if (tenantId) {
      // Multi-tenant path: use the correct adapter for this tenant's platform
      const adapter = await getEcommerceAdapter(tenantId);
      if (!adapter) {
        return { available: false, dataSource: 'no_ecommerce_configured' };
      }
      orders = await adapter.getOrders({ limit: 250, status: 'any' });
    } else {
      // Legacy single-tenant fallback — use Shopify env vars if present
      const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN;
      const shopifyStoreUrl = process.env.SHOPIFY_STORE_URL;
      if (!shopifyAccessToken || !shopifyStoreUrl) {
        return { available: false, dataSource: 'shopify_env_not_configured' };
      }
      const ShopifyAdapter = require('../../services/ecommerce/adapters/shopify');
      const adapter = new ShopifyAdapter({ storeUrl: shopifyStoreUrl, accessToken: shopifyAccessToken });
      orders = await adapter.getOrders({ limit: 250, status: 'any' });
    }

    const todayOrders = orders.filter((o) => (o.createdAt || '').startsWith(dateStr));
    const totalRevenue = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const aov = todayOrders.length ? totalRevenue / todayOrders.length : 0;

    return {
      ordersCount: todayOrders.length,
      revenue: totalRevenue,
      revenueNGN: totalRevenue,  // keep backward-compat field name
      aov,
      currency: todayOrders[0]?.currency || 'USD',
      dataSource: 'ecommerce_adapter',
      available: true,
    };
  } catch (err) {
    logger.warn('aggregateEcommerce failed', { tenantId, error: err.message });
    return { available: false, error: err.message, dataSource: 'ecommerce_adapter' };
  }
}

/**
 * Retrieves the last N days of aggregated metrics from MongoDB for trend analysis.
 * tenantId filters to that tenant's data only.
 */
async function getHistoricalMetrics(days = 30, channel = null, tenantId = null) {
  if (!isMongoAvailable()) return [];
  const Metrics = require('../../models/metrics.model');
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const filter = { date: { $gte: cutoff } };
  if (channel) filter.channel = channel;
  if (tenantId) filter.tenantId = tenantId;
  return Metrics.find(filter).sort({ date: -1 }).limit(days * 5).lean();
}

module.exports = {
  aggregateAll,
  aggregateWebsite,
  aggregateSocial,
  aggregateEmail,
  aggregateCustomerService,
  aggregateEcommerce,
  getHistoricalMetrics,
};
