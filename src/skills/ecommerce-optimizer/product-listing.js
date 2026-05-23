'use strict';

const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { MODELS } = require('../../config/constants');
const shopifyApi = require('../../services/api-clients/shopify-api');
const logger = require('../../utils/logger').forSkill('product-listing');

const SYSTEM_PROMPT = `You are a luxury e-commerce copywriter and SEO specialist for Cascades Luxury — a premium fragrance brand in West Africa.

You craft product listings that:
- Evoke desire and exclusivity — sell the experience, not just the product
- Rank well in Nigerian and Ghanaian search queries (e.g., "luxury perfume Lagos", "best fragrance Nigeria")
- Convert browsers into buyers without discount-driven language
- Pass brand review: no medical claims, no ALL CAPS, no excessive punctuation

Fragrance copy conventions:
- Lead with the olfactory journey (top → heart → base notes)
- Name the occasion and the person this fragrance is for
- Use sensory, aspirational language: "envelops", "lingers", "commands attention"
- Pricing language: never say "cheap" or "affordable" — say "investment", "curated price"`;

const PRODUCT_OPTIMIZE_TOOL = {
  name: 'submit_optimized_listing',
  description: 'Submit the optimized product listing ready for Shopify',
  input_schema: {
    type: 'object',
    properties: {
      optimizedTitle: {
        type: 'string',
        description: 'SEO-optimised product title, max 70 chars, includes key fragrance family and occasion',
      },
      optimizedDescription: {
        type: 'string',
        description: 'Full HTML product description (400-700 words). Include fragrance notes, occasion, brand story, and why this fragrance.',
      },
      shortDescription: {
        type: 'string',
        description: 'One-sentence hook for collection pages and meta description (max 160 chars)',
      },
      seoMetaTitle: { type: 'string', description: 'Meta title for Google (max 60 chars)' },
      seoMetaDescription: { type: 'string', description: 'Meta description (max 160 chars)' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Shopify product tags for filtering and search (10-15 tags)',
      },
      keySellingPoints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Bullet-point USPs for the product page (4-6 points)',
        maxItems: 6,
      },
      fragranceNotes: {
        type: 'object',
        properties: {
          top: { type: 'string' },
          heart: { type: 'string' },
          base: { type: 'string' },
        },
      },
      occasionTags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Occasions this fragrance suits: e.g., "office", "evening", "wedding"',
      },
      crossSellSuggestions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Types of products to cross-sell (e.g., "complementary body lotion", "fragrance travel set")',
        maxItems: 3,
      },
      changesSummary: {
        type: 'string',
        description: 'Brief explanation of what was changed and why',
      },
    },
    required: ['optimizedTitle', 'optimizedDescription', 'shortDescription', 'seoMetaTitle', 'seoMetaDescription', 'tags', 'keySellingPoints', 'changesSummary'],
  },
};

/**
 * Optimises a single Shopify product listing for SEO and conversion.
 * @param {Object} product - product data from Shopify (or manually supplied)
 * @param {Object} [opts]
 * @param {string} [opts.targetAudience] - override audience hint
 * @param {string} [opts.focusKeyword] - SEO primary keyword to target
 */
async function optimizeProductListing(product, opts = {}) {
  const { targetAudience = 'Affluent Nigerian and Ghanaian professionals aged 25-45', focusKeyword } = opts;

  const currentData = {
    title: product.title,
    description: product.body_html || product.description || '',
    vendor: product.vendor,
    productType: product.product_type,
    tags: product.tags,
    variants: product.variants?.map((v) => ({ title: v.title, price: v.price, sku: v.sku })),
    options: product.options,
  };

  const focusHint = focusKeyword ? `\n\nPRIMARY SEO KEYWORD TO TARGET: "${focusKeyword}"` : '';

  const response = await createMessage({
    model: MODELS.PRIMARY,
    maxTokens: 3000,
    system: [cachedSystemBlock(SYSTEM_PROMPT)],
    messages: [{
      role: 'user',
      content: `Optimise this Cascades Luxury product listing for search visibility and luxury conversion.

TARGET AUDIENCE: ${targetAudience}
${focusHint}

CURRENT PRODUCT DATA:
${JSON.stringify(currentData, null, 2)}

Rewrite the listing to maximise organic search ranking for West African luxury shoppers while maintaining premium brand voice.`,
    }],
    tools: [PRODUCT_OPTIMIZE_TOOL],
    label: `Product Optimizer: ${product.title || product.id}`,
  });

  const result = extractToolInput(response);
  if (!result) throw new Error(`Product listing optimizer returned no output for "${product.title}"`);

  logger.info('Product listing optimized', { productId: product.id, title: product.title });
  return result;
}

/**
 * Fetches a product from Shopify and returns an optimized version.
 * If Shopify is not available, accepts productData directly.
 */
async function optimizeProduct(productId, productData = null, opts = {}) {
  let product = productData;

  if (!product && productId) {
    const products = await shopifyApi.getProducts({ limit: 1 });
    product = products.find((p) => String(p.id) === String(productId));
    if (!product) {
      logger.warn('Product not found in Shopify', { productId });
      return { error: 'product_not_found', productId };
    }
  }

  if (!product) return { error: 'no_product_data' };

  const optimized = await optimizeProductListing(product, opts);

  return {
    productId: product.id || productId,
    originalTitle: product.title,
    optimized,
    shopifyUpdatePayload: {
      product: {
        id: product.id,
        title: optimized.optimizedTitle,
        body_html: optimized.optimizedDescription,
        tags: optimized.tags?.join(','),
        metafields: [
          { namespace: 'global', key: 'title_tag', value: optimized.seoMetaTitle, type: 'single_line_text_field' },
          { namespace: 'global', key: 'description_tag', value: optimized.seoMetaDescription, type: 'single_line_text_field' },
        ],
      },
    },
  };
}

module.exports = { optimizeProduct, optimizeProductListing };
