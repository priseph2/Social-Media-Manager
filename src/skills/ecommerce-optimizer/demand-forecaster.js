'use strict';

/**
 * Demand Forecaster — predicts inventory requirements from Shopify order history.
 *
 * Uses Claude to perform qualitative trend analysis on top of simple
 * sales-velocity calculations. This approach works well even with limited
 * historical data (< 3 months), which is typical for growing brands.
 *
 * Also flags low-stock risk before stockouts occur.
 */

const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { MODELS } = require('../../config/constants');
const shopifyApi = require('../../services/api-clients/shopify-api');
const logger = require('../../utils/logger').forSkill('demand-forecaster');

const SYSTEM_PROMPT = `You are a demand planning specialist for Cascades Luxury — a premium fragrance brand in West Africa.

You analyse sales patterns, seasonal trends, and business context to forecast inventory requirements.

West African retail context you always apply:
- "Detty December" (Nov 15 – Jan 5): Nigerian festive season with 2-3x normal demand
- Ramadan: gifting spike for premium products, varies by year
- Valentine's Day, Mother's Day, Christmas: predictable gifting spikes
- Naira devaluation risk: recommend strategic stock-building before volatile FX periods
- Shipping lead times from Europe/UAE: 3-5 weeks — plan ahead
- Luxury fragrances see higher gifting demand vs personal purchase (estimate 60/40 split)`;

const DEMAND_FORECAST_TOOL = {
  name: 'submit_demand_forecast',
  description: 'Submit 90-day demand forecast and inventory recommendations',
  input_schema: {
    type: 'object',
    properties: {
      forecastPeriod: { type: 'string', description: 'e.g., "Next 90 days (May–August 2026)"' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      overallDemandOutlook: {
        type: 'string',
        enum: ['strong_growth', 'moderate_growth', 'stable', 'declining', 'seasonal_spike'],
      },
      productForecasts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            productTitle: { type: 'string' },
            currentStock: { type: 'number' },
            forecastedUnits: { type: 'number', description: 'Units expected to sell in period' },
            daysOfStock: { type: 'number', description: 'How many days current stock lasts at forecast velocity' },
            reorderRecommendation: {
              type: 'string',
              enum: ['reorder_now', 'reorder_soon', 'adequate', 'overstock'],
            },
            reorderQuantity: { type: 'number' },
            urgency: { type: 'string', enum: ['urgent', 'medium', 'low', 'none'] },
          },
          required: ['productTitle', 'reorderRecommendation', 'urgency'],
        },
      },
      stockoutRisks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            product: { type: 'string' },
            estimatedStockoutDate: { type: 'string' },
            revenueAtRisk: { type: 'string' },
            mitigation: { type: 'string' },
          },
        },
      },
      seasonalFactors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            event: { type: 'string' },
            dateRange: { type: 'string' },
            expectedDemandMultiplier: { type: 'string', description: 'e.g., "2.5x normal"' },
            preparationDeadline: { type: 'string' },
          },
        },
      },
      purchasingRecommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            deadline: { type: 'string' },
            rationale: { type: 'string' },
            estimatedBudgetNGN: { type: 'string' },
          },
        },
        maxItems: 5,
      },
      demandDrivers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key factors influencing forecast (e.g., "upcoming Detty December", "Instagram campaign momentum")',
        maxItems: 5,
      },
    },
    required: ['forecastPeriod', 'confidence', 'overallDemandOutlook', 'productForecasts', 'purchasingRecommendations'],
  },
};

/**
 * Calculates basic sales velocity from order history.
 */
function _calculateVelocity(orders, days) {
  const productSales = {};

  for (const order of orders) {
    for (const item of order.line_items || []) {
      const key = item.title || item.product_id;
      if (!productSales[key]) productSales[key] = { title: item.title, productId: item.product_id, unitsSold: 0, revenue: 0 };
      productSales[key].unitsSold += item.quantity || 0;
      productSales[key].revenue += parseFloat(item.price || 0) * (item.quantity || 0);
    }
  }

  return Object.values(productSales).map((p) => ({
    ...p,
    dailyVelocity: p.unitsSold / days,
    monthlyVelocity: (p.unitsSold / days) * 30,
  }));
}

/**
 * Generates a 90-day demand forecast from Shopify order history.
 * @param {Object} [opts]
 * @param {number} [opts.historicalDays=60] - days of order history to analyse
 * @param {number} [opts.forecastDays=90] - forecast horizon
 * @param {string} [opts.currentDate] - override current date for testing
 */
async function forecastDemand(opts = {}) {
  const { historicalDays = 60, forecastDays = 90, currentDate } = opts;
  const now = currentDate ? new Date(currentDate) : new Date();

  logger.info('Fetching order history for demand forecast', { historicalDays });
  const orders = await shopifyApi.getOrders({ status: 'any', limit: 250 });
  const products = await shopifyApi.getProducts({ limit: 50 });

  if (!orders.length && !products.length) {
    return {
      status: 'insufficient_data',
      message: 'No Shopify order history available. Connect SHOPIFY_ACCESS_TOKEN and SHOPIFY_STORE_URL to enable demand forecasting.',
    };
  }

  // Filter to historical window
  const cutoff = new Date(now.getTime() - historicalDays * 24 * 60 * 60 * 1000);
  const historicalOrders = orders.filter((o) => o.created_at && new Date(o.created_at) >= cutoff);

  const velocity = _calculateVelocity(historicalOrders, historicalDays);

  // Build inventory snapshot
  const inventorySnapshot = products.map((p) => ({
    id: p.id,
    title: p.title,
    type: p.product_type,
    variants: (p.variants || []).map((v) => ({
      sku: v.sku,
      price: v.price,
      inventoryQuantity: v.inventory_quantity || 0,
    })),
    totalStock: (p.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0),
    salesVelocity: velocity.find((v) => v.productId === p.id) || null,
  }));

  const forecastStart = now.toISOString().split('T')[0];
  const forecastEnd = new Date(now.getTime() + forecastDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const response = await createMessage({
    model: MODELS.PRIMARY,
    maxTokens: 3000,
    system: [cachedSystemBlock(SYSTEM_PROMPT)],
    messages: [{
      role: 'user',
      content: `Generate a ${forecastDays}-day demand forecast for Cascades Luxury.

FORECAST PERIOD: ${forecastStart} to ${forecastEnd}
HISTORICAL DATA: ${historicalDays} days of order history (${historicalOrders.length} orders)

CURRENT INVENTORY + SALES VELOCITY:
${JSON.stringify(inventorySnapshot, null, 2)}

SALES VELOCITY SUMMARY:
${JSON.stringify(velocity.slice(0, 15), null, 2)}

Please:
1. Forecast demand per product for the next ${forecastDays} days
2. Identify stockout risks and flag urgency level
3. Apply West African seasonality factors relevant to this forecast window
4. Provide specific purchasing/reorder recommendations with deadlines`,
    }],
    tools: [DEMAND_FORECAST_TOOL],
    label: `Demand Forecaster: ${forecastDays}-day forecast`,
  });

  const result = extractToolInput(response);
  if (!result) throw new Error('Demand forecaster returned no output');

  const urgentStockouts = (result.stockoutRisks || []).filter((r) => r.estimatedStockoutDate);
  logger.info('Demand forecast complete', {
    products: inventorySnapshot.length,
    stockoutRisks: urgentStockouts.length,
    confidence: result.confidence,
  });

  return {
    ...result,
    generatedAt: now.toISOString(),
    dataQuality: historicalOrders.length >= 30 ? 'sufficient' : 'limited',
  };
}

module.exports = { forecastDemand };
