'use strict';

/**
 * Plan definitions — single source of truth for limits, features, and pricing.
 *
 * paystackPlanCode values are the Plan codes created in your Paystack Dashboard
 * (Subscriptions → Plans). Set them via env vars.
 */
const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceUSD: 49,
    priceNGN: 75_000,
    paystackPlanCode: process.env.PAYSTACK_PLAN_CODE_STARTER || '',
    limits: {
      maxBrands: 1,
      monthlyAiOps: 500,       // AI API calls per calendar month
    },
    features: {
      socialScheduling: true,
      brandGuardian: true,
      customerService: true,
      basicAnalytics: true,
      emailCampaigns: false,
      ecommerceOptimizer: false,
      advancedAnalytics: false,
      ga4: false,
      forecasting: false,
      contentCalendar: true,
      whiteLabel: false,
      customReporting: false,
      prioritySupport: false,
    },
  },

  growth: {
    id: 'growth',
    name: 'Growth',
    priceUSD: 149,
    priceNGN: 225_000,
    paystackPlanCode: process.env.PAYSTACK_PLAN_CODE_GROWTH || '',
    limits: {
      maxBrands: 3,
      monthlyAiOps: 2_000,
    },
    features: {
      socialScheduling: true,
      brandGuardian: true,
      customerService: true,
      basicAnalytics: true,
      emailCampaigns: true,
      ecommerceOptimizer: true,
      advancedAnalytics: true,
      ga4: true,
      forecasting: true,
      contentCalendar: true,
      whiteLabel: false,
      customReporting: false,
      prioritySupport: false,
    },
  },

  agency: {
    id: 'agency',
    name: 'Agency',
    priceUSD: 399,
    priceNGN: 600_000,
    paystackPlanCode: process.env.PAYSTACK_PLAN_CODE_AGENCY || '',
    limits: {
      maxBrands: Infinity,
      monthlyAiOps: Infinity,    // unlimited
    },
    features: {
      socialScheduling: true,
      brandGuardian: true,
      customerService: true,
      basicAnalytics: true,
      emailCampaigns: true,
      ecommerceOptimizer: true,
      advancedAnalytics: true,
      ga4: true,
      forecasting: true,
      contentCalendar: true,
      whiteLabel: true,
      customReporting: true,
      prioritySupport: true,
    },
  },
};

// Model pricing (USD per million tokens)
const MODEL_PRICING = {
  'claude-sonnet-4-6': {
    inputPerM: 3.00,
    outputPerM: 15.00,
    cacheWritePerM: 3.75,
    cacheReadPerM: 0.30,
  },
  'claude-haiku-4-5-20251001': {
    inputPerM: 0.25,
    outputPerM: 1.25,
    cacheWritePerM: 0.30,
    cacheReadPerM: 0.03,
  },
};

/**
 * Returns the plan config object for the given plan id.
 * Falls back to 'starter' for unknown ids.
 */
function getPlan(planId) {
  return PLANS[planId] ?? PLANS.starter;
}

/**
 * Checks whether a feature flag is enabled for a plan.
 */
function isFeatureEnabled(planId, feature) {
  const plan = getPlan(planId);
  return plan.features[feature] === true;
}

/**
 * Returns true if the plan has unlimited AI operations.
 */
function hasUnlimitedOps(planId) {
  return getPlan(planId).limits.monthlyAiOps === Infinity;
}

/**
 * Calculates the USD cost of one Claude API call given token counts.
 */
function estimateCost(model, inputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0) {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['claude-sonnet-4-6'];
  return (
    (inputTokens       / 1_000_000) * pricing.inputPerM +
    (outputTokens      / 1_000_000) * pricing.outputPerM +
    (cacheReadTokens   / 1_000_000) * pricing.cacheReadPerM +
    (cacheWriteTokens  / 1_000_000) * pricing.cacheWritePerM
  );
}

module.exports = { PLANS, MODEL_PRICING, getPlan, isFeatureEnabled, hasUnlimitedOps, estimateCost };
