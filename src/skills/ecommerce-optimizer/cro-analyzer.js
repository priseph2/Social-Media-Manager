'use strict';

/**
 * Conversion Rate Optimisation Analyzer
 *
 * Analyses the e-commerce funnel to identify drop-off points and
 * generate prioritised CRO recommendations for Cascades Luxury.
 *
 * Data sources:
 *   - GA4: sessions, bounce rate, funnel steps (Product View → Cart → Checkout → Purchase)
 *   - Shopify: checkout abandonment, payment method breakdown, refund rate
 *   - Supabase: content_schedule (which posts drove traffic)
 */

const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { MODELS } = require('../../config/constants');
const { supabaseQuery } = require('../../services/database/supabase-client');
const shopifyApi = require('../../services/api-clients/shopify-api');
const ga4 = require('../../services/api-clients/google-analytics');
const logger = require('../../utils/logger').forSkill('cro-analyzer');

const SYSTEM_PROMPT = `You are a Conversion Rate Optimisation (CRO) specialist for Cascades Luxury — a premium fragrance e-commerce brand in West Africa.

You analyse purchase funnels, identify friction points, and recommend evidence-based improvements.
Every recommendation must preserve the luxury brand experience — no cluttered pages, no desperation tactics.

CRO priorities for luxury retail:
1. Trust signals matter more than price — reviews, brand story, secure payment badges
2. Product imagery and video quality drives fragrance purchase decisions
3. Mobile-first: most Nigerian and Ghanaian shoppers use mobile
4. Payment method diversity is critical (card + bank transfer + mobile money)
5. Shipping transparency reduces cart abandonment significantly`;

const FUNNEL_ANALYSIS_TOOL = {
  name: 'submit_funnel_analysis',
  description: 'Submit conversion funnel analysis and CRO recommendations',
  input_schema: {
    type: 'object',
    properties: {
      overallConversionRate: {
        type: 'string',
        description: 'Current estimated conversion rate (e.g., "1.2%")',
      },
      funnelSteps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            step: { type: 'string' },
            dropOffRate: { type: 'string' },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            likelyCause: { type: 'string' },
          },
        },
        description: 'Each step in the purchase funnel with drop-off analysis',
      },
      topBottlenecks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            issue: { type: 'string' },
            impact: { type: 'string', description: 'Estimated revenue impact if fixed' },
            evidence: { type: 'string' },
          },
        },
        maxItems: 3,
      },
      quickWins: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            effort: { type: 'string', enum: ['low', 'medium', 'high'] },
            expectedLift: { type: 'string', description: 'e.g., "+0.3% conversion rate"' },
            implementation: { type: 'string', description: 'Specific steps to implement' },
          },
        },
        description: 'High-impact, low-effort improvements to implement first',
        maxItems: 5,
      },
      strategicRecommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            recommendation: { type: 'string' },
            rationale: { type: 'string' },
            timeframe: { type: 'string', enum: ['this_week', 'this_month', 'next_quarter'] },
            owner: { type: 'string' },
          },
        },
        maxItems: 4,
      },
      abTestSuggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            element: { type: 'string', description: 'What to test (e.g., CTA button, hero image)' },
            hypothesis: { type: 'string' },
            variants: { type: 'array', items: { type: 'string' } },
          },
        },
        maxItems: 3,
      },
      mobileInsights: { type: 'string', description: 'Specific mobile UX observations' },
      estimatedRevenueImpact: {
        type: 'string',
        description: 'Projected monthly revenue increase if top 3 issues are fixed',
      },
    },
    required: ['overallConversionRate', 'funnelSteps', 'topBottlenecks', 'quickWins', 'strategicRecommendations'],
  },
};

/**
 * Builds a funnel data snapshot from available sources.
 */
async function _gatherFunnelData(dateRange = 30) {
  const startDate = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const endDate = new Date().toISOString().split('T')[0];

  const [orders, conversionMetrics, recentPosts] = await Promise.all([
    shopifyApi.getOrders({ status: 'any', limit: 250 }),
    ga4.getConversionMetrics({ startDate, endDate }),
    supabaseQuery((db) =>
      db.from('content_schedule')
        .select('platform, content_type, status, scheduled_at')
        .eq('status', 'posted')
        .gte('scheduled_at', `${startDate}T00:00:00Z`)
        .order('scheduled_at', { ascending: false })
        .limit(50)
    ) || [],
  ]);

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
  const avgOrderValue = totalOrders ? totalRevenue / totalOrders : 0;

  return {
    dateRange: `${startDate} to ${endDate}`,
    orders: { total: totalOrders, totalRevenueNGN: totalRevenue, avgOrderValueNGN: avgOrderValue },
    ga4ConversionData: conversionMetrics,
    contentActivity: { postsPublished: recentPosts.length, byPlatform: recentPosts.reduce((acc, p) => { acc[p.platform] = (acc[p.platform] || 0) + 1; return acc; }, {}) },
    dataQuality: conversionMetrics ? 'ga4_connected' : 'shopify_only',
  };
}

/**
 * Runs a full CRO analysis and returns prioritised recommendations.
 * @param {Object} [opts]
 * @param {number} [opts.dateRange=30] - days of data to analyse
 * @param {Object} [opts.additionalContext] - any extra known issues to include
 */
async function analyzeFunnel(opts = {}) {
  const { dateRange = 30, additionalContext = {} } = opts;

  logger.info('Gathering funnel data for CRO analysis', { dateRange });
  const funnelData = await _gatherFunnelData(dateRange);

  const contextStr = Object.keys(additionalContext).length
    ? `\n\nADDITIONAL CONTEXT:\n${JSON.stringify(additionalContext, null, 2)}`
    : '';

  const response = await createMessage({
    model: MODELS.PRIMARY,
    maxTokens: 3000,
    system: [cachedSystemBlock(SYSTEM_PROMPT)],
    messages: [{
      role: 'user',
      content: `Analyse this Cascades Luxury conversion funnel data and provide actionable CRO recommendations.

FUNNEL DATA (last ${dateRange} days):
${JSON.stringify(funnelData, null, 2)}
${contextStr}

BRAND CONTEXT:
- Premium fragrance brand in Lagos and Accra
- Target customer: affluent professional, mobile-first, values brand trust
- Current known friction: limited payment options in West Africa, shipping uncertainty
- Average fragrance price: ₦35,000-₦150,000

Provide specific, prioritised recommendations to improve conversion rate while maintaining luxury positioning.`,
    }],
    tools: [FUNNEL_ANALYSIS_TOOL],
    label: 'CRO Analyzer: funnel analysis',
  });

  const result = extractToolInput(response);
  if (!result) throw new Error('CRO analyzer returned no output');

  logger.info('Funnel analysis complete', {
    bottlenecks: result.topBottlenecks?.length,
    quickWins: result.quickWins?.length,
  });

  return { ...result, funnelData, analysedAt: new Date().toISOString() };
}

module.exports = { analyzeFunnel };
