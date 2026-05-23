'use strict';

const BaseSkill = require('../base-skill');
const { SKILLS, MODELS } = require('../../config/constants');
const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { optimizeProduct } = require('./product-listing');
const { analyzeFunnel } = require('./cro-analyzer');
const { analyzeProductPricing, analyzeRangePricing } = require('./pricing-intelligence');
const { forecastDemand } = require('./demand-forecaster');
const shopifyApi = require('../../services/api-clients/shopify-api');
const { isMongoAvailable } = require('../../services/database/mongodb-client');

/**
 * SKILL 7: E-Commerce & Sales Optimizer — Phase 5 (Fully Implemented)
 *
 * Maximises Cascades Luxury's online revenue across product listings,
 * conversion funnel, pricing, and inventory.
 *
 * Job types:
 *   optimize-product      → rewrites a product listing for SEO + conversion
 *   analyze-funnel        → CRO analysis with prioritised quick-wins
 *   forecast-demand       → 90-day inventory requirements with stockout alerts
 *   recommend-products    → personalised product recommendations for a customer
 *   pricing-analysis      → optimal price points (single product or full range)
 */

const RECOMMENDATION_SYSTEM = `You are a personal fragrance consultant for Cascades Luxury — a premium brand in West Africa.

You recommend the perfect fragrance from the brand's catalogue based on a customer's profile and purchase history.

Recommendation principles:
- Never recommend something the customer already owns
- Lead with the olfactory fit, then occasion/lifestyle match
- Show you understand their taste if they're a repeat buyer
- For new customers, ask about preferences before making 3-5 specific suggestions
- Frame recommendations as curated discoveries, not algorithmic outputs
- Always mention what makes each recommendation special for this specific person`;

const RECOMMENDATION_TOOL = {
  name: 'submit_recommendations',
  description: 'Submit personalised product recommendations for a customer',
  input_schema: {
    type: 'object',
    properties: {
      customerGreeting: {
        type: 'string',
        description: 'Personalised opening (acknowledges their history if repeat customer)',
      },
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            productTitle: { type: 'string' },
            productId: { type: 'string' },
            matchScore: { type: 'number', description: '0-100 fit score' },
            whyThisFragrance: { type: 'string', description: 'Personalised reason specific to this customer' },
            occasion: { type: 'string' },
            fragranceFamily: { type: 'string' },
            pricingNGN: { type: 'string' },
          },
          required: ['productTitle', 'whyThisFragrance', 'occasion'],
        },
        minItems: 1,
        maxItems: 5,
      },
      upsellOpportunity: {
        type: 'object',
        properties: {
          product: { type: 'string' },
          rationale: { type: 'string' },
        },
        description: 'A natural upsell (e.g., larger bottle, complementary product)',
      },
      consultationNote: {
        type: 'string',
        description: 'Optional note about preferences to log for next recommendation cycle',
      },
    },
    required: ['customerGreeting', 'recommendations'],
  },
};

class EcommerceOptimizer extends BaseSkill {
  constructor() {
    super(SKILLS.ECOMMERCE_OPTIMIZER);
  }

  async execute(job) {
    switch (job.name) {
      case 'optimize-product':
        return this.optimizeProduct(job);
      case 'analyze-funnel':
        return this.analyzeFunnel(job);
      case 'forecast-demand':
        return this.forecastDemand(job);
      case 'recommend-products':
        return this.recommendProducts(job);
      case 'pricing-analysis':
        return this.pricingAnalysis(job);
      default:
        throw new Error(`E-Commerce Optimizer: unknown job "${job.name}"`);
    }
  }

  // ── Optimize Product Listing ──────────────────────────────────────────────

  async optimizeProduct(job) {
    const { productId, productData, focusKeyword, targetAudience, applyToShopify = false } = job.data;
    this.log.info('Optimising product listing', { productId, jobId: job.id });

    const result = await optimizeProduct(productId, productData, { focusKeyword, targetAudience });

    if (!result.error && applyToShopify && productId) {
      const updated = await shopifyApi.updateProduct(productId, result.shopifyUpdatePayload?.product);
      result.shopifyUpdated = Boolean(updated);
    }

    return { ...result, jobId: job.id };
  }

  // ── CRO / Funnel Analysis ─────────────────────────────────────────────────

  async analyzeFunnel(job) {
    const { dateRange = 30, additionalContext } = job.data;
    this.log.info('Analysing checkout funnel', { dateRange, jobId: job.id });

    const result = await analyzeFunnel({ dateRange, additionalContext });
    return { ...result, jobId: job.id };
  }

  // ── Demand Forecasting ────────────────────────────────────────────────────

  async forecastDemand(job) {
    const { historicalDays = 60, forecastDays = 90 } = job.data;
    this.log.info(`Forecasting demand for next ${forecastDays} days`, { jobId: job.id });

    const result = await forecastDemand({ historicalDays, forecastDays });

    // Escalate urgent stockout risks
    const urgentRisks = (result.stockoutRisks || []).filter((r) =>
      (result.productForecasts || []).find((p) => p.productTitle === r.product && p.urgency === 'urgent')
    );
    if (urgentRisks.length) {
      this.log.warn('Urgent stockout risks detected', { count: urgentRisks.length });
    }

    return { ...result, jobId: job.id };
  }

  // ── Product Recommendations ───────────────────────────────────────────────

  async recommendProducts(job) {
    const { customerProfile, currentProduct, excludeProductIds = [] } = job.data;
    this.log.info('Generating personalised product recommendations', { jobId: job.id });

    // Pull available products from Shopify
    const allProducts = await shopifyApi.getProducts({ limit: 50 });

    const availableProducts = allProducts
      .filter((p) => !excludeProductIds.includes(String(p.id)))
      .map((p) => ({
        id: p.id,
        title: p.title,
        type: p.product_type,
        price: p.variants?.[0]?.price,
        inStock: (p.variants || []).some((v) => v.inventory_quantity > 0),
        tags: p.tags,
      }))
      .filter((p) => p.inStock);

    const catalogueContext = availableProducts.length
      ? `AVAILABLE PRODUCTS (in stock):\n${JSON.stringify(availableProducts, null, 2)}`
      : 'No Shopify catalogue available — provide general fragrance family recommendations.';

    const profileStr = customerProfile
      ? `CUSTOMER PROFILE:\n${JSON.stringify(customerProfile, null, 2)}`
      : 'New customer — no profile data yet.';

    const currentProductStr = currentProduct
      ? `CURRENTLY VIEWING: ${JSON.stringify(currentProduct, null, 2)}`
      : '';

    const response = await createMessage({
      model: MODELS.PRIMARY,
      maxTokens: 1500,
      system: [cachedSystemBlock(RECOMMENDATION_SYSTEM)],
      messages: [{
        role: 'user',
        content: `Generate personalised fragrance recommendations for this Cascades Luxury customer.

${profileStr}
${currentProductStr}

${catalogueContext}

EXCLUDED PRODUCTS (already purchased): ${excludeProductIds.join(', ') || 'None'}

Recommend 3-5 fragrances that genuinely match this customer's taste and lifestyle.`,
      }],
      tools: [RECOMMENDATION_TOOL],
      label: 'E-Commerce: product recommendations',
    });

    const result = extractToolInput(response);
    if (!result) throw new Error('Product recommendation engine returned no output');

    this.log.info('Recommendations generated', { count: result.recommendations?.length });
    return { ...result, jobId: job.id };
  }

  // ── Pricing Analysis ──────────────────────────────────────────────────────

  async pricingAnalysis(job) {
    const { productId, productData, scope = 'single' } = job.data;
    this.log.info('Running pricing analysis', { scope, productId, jobId: job.id });

    if (scope === 'range') {
      const result = await analyzeRangePricing();
      return { ...result, scope, jobId: job.id };
    }

    // Single product analysis
    let product = productData;
    if (!product && productId) {
      const products = await shopifyApi.getProducts({ limit: 250 });
      product = products.find((p) => String(p.id) === String(productId));
    }

    if (!product) {
      return { error: 'product_not_found', productId, scope, jobId: job.id };
    }

    const result = await analyzeProductPricing(product, {
      salesVelocity: job.data.salesVelocity,
      inventoryLevel: job.data.inventoryLevel,
      competitorData: job.data.competitorData,
    });

    return { ...result, scope, jobId: job.id };
  }
}

module.exports = EcommerceOptimizer;
