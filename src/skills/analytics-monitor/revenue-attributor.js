'use strict';

const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { MODELS } = require('../../config/constants');
const { supabaseQuery } = require('../../services/database/supabase-client');
const { isMongoAvailable } = require('../../services/database/mongodb-client');
const Content = require('../../models/content.model');
const logger = require('../../utils/logger').forSkill('revenue-attributor');

const ATTRIBUTION_TOOL = {
  name: 'submit_revenue_attribution',
  description: 'Submit revenue attribution results linking an order to content',
  input_schema: {
    type: 'object',
    properties: {
      attributedContentId: {
        type: 'string',
        description: 'MongoDB _id of the content piece most likely to have driven this order, or null if none',
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low', 'none'],
        description: '"none" means no content can be reasonably attributed',
      },
      attributionModel: {
        type: 'string',
        enum: ['last_touch', 'first_touch', 'multi_touch', 'none'],
      },
      reasoning: {
        type: 'string',
        description: 'Explain which signals support the attribution decision',
      },
      supportingContentIds: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 3,
        description: 'Other content pieces that may have contributed (multi-touch)',
      },
      recommendedFollowUp: {
        type: 'string',
        description: 'What content action should follow given this purchase signal',
      },
    },
    required: ['confidence', 'attributionModel', 'reasoning'],
  },
};

/**
 * Attributes a single order to the content pieces most likely to have driven it.
 *
 * The attribution window is 24-72 hours before the order was placed.
 * We pass the order details and recent content to Claude for a reasoned decision.
 *
 * @param {object} order     — normalised order object { id, createdAt, total, currency, lineItems }
 * @param {string} tenantId  — tenant id for scoping the Content query
 * @param {string} platform  — 'shopify' | 'woocommerce' etc (for the audit log)
 */
async function attributeOrder(order, tenantId, platform = 'shopify') {
  if (!tenantId) {
    logger.warn('attributeOrder called without tenantId — skipping to prevent cross-tenant attribution');
    return null;
  }
  if (!isMongoAvailable()) {
    logger.warn('MongoDB unavailable — skipping revenue attribution');
    return null;
  }

  const orderDate = new Date(order.createdAt || order.created_at || Date.now());
  const windowStart = new Date(orderDate.getTime() - 72 * 60 * 60 * 1000);

  // Pull content posted in the 72h window before the order
  const filter = {
    postedAt: { $gte: windowStart, $lte: orderDate },
    'brandReview.status': 'approved',
  };
  if (tenantId) filter.tenantId = tenantId;

  const recentContent = await Content.find(filter)
    .sort({ postedAt: -1 })
    .limit(20)
    .select('_id type platform postedAt variations.text performance')
    .lean();

  if (!recentContent.length) {
    logger.info('No content in attribution window', { orderId: order.id, windowStart });
    return null;
  }

  const productNames = (order.lineItems || []).map((li) => li.title).join(', ') || 'unknown products';

  const context = `An order was placed:
Order ID: ${order.id}
Order value: ${order.total} ${order.currency}
Products: ${productNames}
Order placed at: ${orderDate.toISOString()}

Content published in the 72 hours before this order:
${recentContent.map((c) => `
- Content ID: ${c._id}
  Platform: ${c.platform} | Type: ${c.type}
  Posted: ${c.postedAt?.toISOString()}
  Text preview: "${(c.variations?.[0]?.text || '').slice(0, 250)}"
  Performance: ${JSON.stringify(c.performance || {})}
`).join('')}

Determine which piece of content (if any) most likely influenced this purchase.
Consider: time proximity, product relevance, content platform, and performance signals.
If multiple pieces contributed, use multi_touch attribution.
Be honest — if the attribution is speculative, say so and mark confidence accordingly.`;

  try {
    const response = await createMessage({
      model: MODELS.FAST,
      maxTokens: 800,
      system: [cachedSystemBlock(
        'You are a marketing attribution specialist. You link customer purchases to the content that drove them using evidence-based reasoning.'
      )],
      messages: [{ role: 'user', content: context }],
      tools: [ATTRIBUTION_TOOL],
      label: `Revenue Attribution: order ${order.id}`,
    });

    const attribution = extractToolInput(response);
    if (!attribution) return null;

    // Persist attribution to Supabase
    if (tenantId && attribution.confidence !== 'none' && attribution.attributedContentId) {
      await _persistAttribution(tenantId, attribution, order, platform);
      await _updateContentDocument(attribution.attributedContentId, order, attribution);
    }

    logger.info('Revenue attribution complete', {
      orderId: order.id,
      contentId: attribution.attributedContentId,
      confidence: attribution.confidence,
    });

    return attribution;
  } catch (err) {
    logger.error('attributeOrder failed', { orderId: order.id, error: err.message });
    return null;
  }
}

async function _persistAttribution(tenantId, attribution, order, platform) {
  const rows = [
    { tenant_id: tenantId, content_id: attribution.attributedContentId, order_id: order.id, platform, order_amount: order.total, currency: order.currency, confidence: attribution.confidence, reasoning: attribution.reasoning },
    ...(attribution.supportingContentIds || []).map((cid) => ({
      tenant_id: tenantId, content_id: cid, order_id: order.id, platform, order_amount: order.total, currency: order.currency, confidence: 'low', reasoning: 'Multi-touch supporting content',
    })),
  ].filter((r) => r.content_id);

  if (!rows.length) return;

  await supabaseQuery((db) =>
    db.from('content_attributions').upsert(rows, { onConflict: 'tenant_id,order_id,content_id' })
  ).catch((err) => logger.warn('Failed to persist attribution', { error: err.message }));
}

async function _updateContentDocument(contentId, order, attribution) {
  try {
    await Content.findByIdAndUpdate(contentId, {
      $push: {
        revenueAttributions: {
          orderId: order.id,
          amount: order.total,
          currency: order.currency,
          confidence: attribution.confidence,
          attributedAt: new Date(),
        },
      },
    });
  } catch (err) {
    logger.warn('Failed to update Content document with attribution', { contentId, error: err.message });
  }
}

/**
 * Fetches attribution data for a specific content piece.
 * Returns total attributed revenue and list of orders.
 */
async function getContentAttribution(contentId, tenantId) {
  const rows = await supabaseQuery((db) =>
    db.from('content_attributions')
      .select('order_id, order_amount, currency, confidence, reasoning, attributed_at')
      .eq('content_id', contentId)
      .eq('tenant_id', tenantId)
      .order('attributed_at', { ascending: false })
  ) || [];

  const totalRevenue = rows.reduce((sum, r) => sum + Number(r.order_amount || 0), 0);

  return {
    contentId,
    totalAttributedRevenue: totalRevenue,
    currency: rows[0]?.currency || 'USD',
    orderCount: rows.length,
    orders: rows,
  };
}

/**
 * Returns the top revenue-driving content pieces for a tenant in the given period.
 */
async function getTopAttributedContent(tenantId, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const rows = await supabaseQuery((db) =>
    db.from('content_attributions')
      .select('content_id, order_amount, currency, confidence')
      .eq('tenant_id', tenantId)
      .gte('attributed_at', since)
  ) || [];

  // Aggregate by content_id
  const byContent = {};
  for (const r of rows) {
    if (!byContent[r.content_id]) byContent[r.content_id] = { contentId: r.content_id, totalRevenue: 0, orderCount: 0, currency: r.currency };
    byContent[r.content_id].totalRevenue += Number(r.order_amount || 0);
    byContent[r.content_id].orderCount += 1;
  }

  return Object.values(byContent).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10);
}

module.exports = { attributeOrder, getContentAttribution, getTopAttributedContent };
