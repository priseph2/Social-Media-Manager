'use strict';

/**
 * Pricing Intelligence — analyses sales velocity, inventory, and margin
 * to recommend optimal price points that protect luxury positioning.
 *
 * Principles:
 *   - Never recommend a price that signals mass-market
 *   - Price anchoring: keep premium SKUs visible even when promoting others
 *   - Promotional pricing is time-boxed and framed as "exclusive" not "discounted"
 *   - Bundle pricing increases AOV without cheapening individual items
 */

const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { MODELS } = require('../../config/constants');
const shopifyApi = require('../../services/api-clients/shopify-api');
const logger = require('../../utils/logger').forSkill('pricing-intelligence');

const SYSTEM_PROMPT = `You are a pricing strategist for Cascades Luxury — a premium fragrance brand in West Africa.

You recommend optimal price points that maximise revenue while protecting the brand's luxury positioning.

Pricing principles you follow:
1. Luxury goods have inelastic demand — never assume lower price = more sales
2. Price anchoring: a ₦180,000 fragrance makes a ₦95,000 one feel "accessible luxury"
3. Promotional pricing must always have a story (seasonal, exclusive, limited stock)
4. Bundle pricing should feel like a "curator's selection", not a discount bundle
5. Naira volatility means pricing reviews should happen monthly, not annually
6. Currency context: 1 USD ≈ 1,550 NGN as of 2026; quote both where helpful`;

const PRICING_TOOL = {
  name: 'submit_pricing_analysis',
  description: 'Submit pricing recommendations for a product or range',
  input_schema: {
    type: 'object',
    properties: {
      currentPrice: { type: 'string' },
      recommendedPrice: { type: 'string' },
      priceChangeType: {
        type: 'string',
        enum: ['increase', 'decrease', 'maintain', 'reposition'],
        description: '"reposition" means structural change like new size variant',
      },
      changePercentage: { type: 'string', description: 'e.g., "+8%" or "-5%"' },
      rationale: {
        type: 'string',
        description: 'Business case for the recommendation (2-3 sentences)',
      },
      brandPositioningImpact: {
        type: 'string',
        enum: ['strengthens', 'neutral', 'risks_commoditisation'],
        description: 'How this price change affects luxury perception',
      },
      implementationNotes: {
        type: 'string',
        description: 'How to communicate the change (e.g., "Frame as premium relaunch, not price hike")',
      },
      bundleOpportunities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            bundleName: { type: 'string' },
            components: { type: 'array', items: { type: 'string' } },
            suggestedBundlePrice: { type: 'string' },
            aovLift: { type: 'string' },
          },
        },
        maxItems: 3,
      },
      competitorContext: {
        type: 'string',
        description: 'Where this price sits vs comparable luxury fragrances',
      },
      expectedImpact: {
        type: 'object',
        properties: {
          revenueChange: { type: 'string', description: 'e.g., "+12% monthly revenue"' },
          volumeChange: { type: 'string', description: 'e.g., "-5% units sold" or "flat"' },
          marginChange: { type: 'string' },
        },
      },
      reviewDate: {
        type: 'string',
        description: 'When to revisit this pricing decision (ISO date or relative)',
      },
    },
    required: ['currentPrice', 'recommendedPrice', 'priceChangeType', 'rationale', 'brandPositioningImpact', 'implementationNotes'],
  },
};

const RANGE_PRICING_TOOL = {
  name: 'submit_range_pricing_strategy',
  description: 'Submit pricing strategy for the entire product range',
  input_schema: {
    type: 'object',
    properties: {
      priceArchitecture: {
        type: 'object',
        properties: {
          entry: { type: 'string', description: 'Entry-level price point and rationale' },
          core: { type: 'string', description: 'Core luxury range price point' },
          prestige: { type: 'string', description: 'Prestige/halo price point' },
        },
      },
      productAdjustments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            productTitle: { type: 'string' },
            currentPrice: { type: 'string' },
            recommendedPrice: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
      seasonalStrategy: {
        type: 'object',
        properties: {
          q1: { type: 'string' },
          q2: { type: 'string' },
          q3: { type: 'string' },
          q4: { type: 'string', description: 'Holiday + Detty December (Nigerian celebration season)' },
        },
      },
      overallStrategy: { type: 'string' },
      keyRisks: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    },
    required: ['priceArchitecture', 'overallStrategy'],
  },
};

/**
 * Analyses pricing for a single product.
 */
async function analyzeProductPricing(product, opts = {}) {
  const { salesVelocity, inventoryLevel, competitorData } = opts;

  const productContext = {
    title: product.title,
    currentPriceNGN: product.variants?.[0]?.price || product.price,
    productType: product.product_type,
    vendor: product.vendor,
    variants: product.variants?.map((v) => ({ title: v.title, price: v.price, inventoryQuantity: v.inventory_quantity })),
    salesVelocity: salesVelocity || null,
    inventoryLevel: inventoryLevel || null,
    competitorData: competitorData || null,
  };

  const response = await createMessage({
    model: MODELS.PRIMARY,
    maxTokens: 1500,
    system: [cachedSystemBlock(SYSTEM_PROMPT)],
    messages: [{
      role: 'user',
      content: `Analyse the pricing for this Cascades Luxury product and recommend the optimal price point.

PRODUCT:
${JSON.stringify(productContext, null, 2)}

Consider: luxury positioning, Naira purchasing power, competitive landscape for premium fragrances in Nigeria/Ghana, and any inventory pressure.`,
    }],
    tools: [PRICING_TOOL],
    label: `Pricing Intelligence: ${product.title}`,
  });

  const result = extractToolInput(response);
  if (!result) throw new Error(`Pricing analysis returned no output for "${product.title}"`);

  logger.info('Product pricing analysis complete', { title: product.title, recommendation: result.priceChangeType });
  return { productId: product.id, productTitle: product.title, ...result };
}

/**
 * Analyses pricing strategy across the entire product range.
 * Pulls all products from Shopify and reviews the price architecture.
 */
async function analyzeRangePricing() {
  const products = await shopifyApi.getProducts({ limit: 50 });

  if (!products.length) {
    return {
      status: 'no_products',
      message: 'No products available in Shopify. Connect Shopify credentials to enable range pricing analysis.',
    };
  }

  const productSummary = products.map((p) => ({
    id: p.id,
    title: p.title,
    type: p.product_type,
    prices: p.variants?.map((v) => v.price) || [],
    totalInventory: p.variants?.reduce((s, v) => s + (v.inventory_quantity || 0), 0),
  }));

  const response = await createMessage({
    model: MODELS.PRIMARY,
    maxTokens: 2000,
    system: [cachedSystemBlock(SYSTEM_PROMPT)],
    messages: [{
      role: 'user',
      content: `Review the entire Cascades Luxury product range pricing and recommend a coherent price architecture.

CURRENT PRODUCT RANGE (${products.length} products):
${JSON.stringify(productSummary, null, 2)}

Provide:
1. A 3-tier price architecture (entry / core luxury / prestige)
2. Individual product adjustments where needed
3. Seasonal pricing strategy (Nigeria has strong Q4 "Detty December" spending spike)
4. Overall strategic direction`,
    }],
    tools: [RANGE_PRICING_TOOL],
    label: 'Pricing Intelligence: range analysis',
  });

  const result = extractToolInput(response);
  if (!result) throw new Error('Range pricing analysis returned no output');

  logger.info('Range pricing analysis complete', { products: products.length });
  return { ...result, productCount: products.length, analysedAt: new Date().toISOString() };
}

module.exports = { analyzeProductPricing, analyzeRangePricing };
