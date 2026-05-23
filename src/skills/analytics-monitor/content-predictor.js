'use strict';

const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { MODELS } = require('../../config/constants');
const { supabaseQuery } = require('../../services/database/supabase-client');
const logger = require('../../utils/logger').forSkill('content-predictor');

const PREDICTION_TOOL = {
  name: 'submit_performance_prediction',
  description: 'Submit predicted performance metrics for a content piece before it is published',
  input_schema: {
    type: 'object',
    properties: {
      predictedEngagementRate: {
        type: 'number',
        description: 'Predicted engagement rate as a percentage (likes + comments + shares / reach × 100)',
      },
      predictedReach: {
        type: 'number',
        description: 'Estimated number of unique accounts reached',
      },
      viralPotential: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Qualitative likelihood of organic amplification beyond followers',
      },
      confidence: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Confidence in the prediction given available data',
      },
      keyStrengths: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 3,
        description: 'Content elements most likely to drive positive performance',
      },
      keyWeaknesses: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 3,
        description: 'Content elements that may limit performance',
      },
      improvementSuggestions: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 3,
        description: 'Specific, actionable edits to improve predicted performance before publishing',
      },
      optimalPostingWindows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            day: { type: 'string' },
            timeRange: { type: 'string', description: 'e.g. "19:00–21:00 WAT"' },
            reason: { type: 'string' },
          },
        },
        maxItems: 3,
      },
      estimatedRevenueImpact: {
        type: 'string',
        description: 'Qualitative estimate of revenue or commercial impact if this drives traffic to the store',
      },
      comparisonToTopPerformers: {
        type: 'string',
        description: 'How this content compares to the brand\'s historically best-performing posts',
      },
    },
    required: ['predictedEngagementRate', 'confidence', 'keyStrengths', 'improvementSuggestions'],
  },
};

/**
 * Predicts the performance of a content piece before publishing.
 *
 * @param {object} params
 * @param {string} params.contentText         — the content / caption to evaluate
 * @param {string} params.platform            — instagram | facebook | tiktok | twitter | pinterest
 * @param {string} [params.scheduledAt]       — ISO date string of planned post time
 * @param {Array}  [params.historicalContent] — recent high-performing content docs from MongoDB
 * @param {object} [params.brandConfig]       — brand guidelines
 * @param {object} [params.audienceData]      — audience profile from brand config
 * @param {string} [params.contentId]         — MongoDB doc id (if already saved)
 * @param {string} [params.tenantId]          — for persisting prediction
 */
async function predictContentPerformance({
  contentText,
  platform,
  scheduledAt = null,
  historicalContent = [],
  brandConfig = {},
  tenantId = null,
  contentId = null,
}) {
  const brandName = brandConfig?.identity?.name || 'the brand';
  const industry = brandConfig?.identity?.positioning || 'retail';
  const audience = brandConfig?.audience?.primary || 'general audience';

  const systemPrompt = `You are a content performance analyst specialising in social media for ${brandName} (${industry}).

You have deep knowledge of what drives engagement, reach, and commercial impact on ${platform}.
You analyse content before it is published and provide honest, data-grounded predictions.
When historical performance data is available, weight your predictions on actual patterns.
Be specific and quantitative — vague predictions are unhelpful.`;

  const topPerformers = historicalContent
    .filter((c) => c.performance?.engagementRate)
    .sort((a, b) => (b.performance?.engagementRate || 0) - (a.performance?.engagementRate || 0))
    .slice(0, 5)
    .map((c) => ({
      text: c.variations?.[0]?.text?.slice(0, 200),
      engagementRate: c.performance?.engagementRate,
      reach: c.performance?.reach,
      postedAt: c.postedAt,
    }));

  const scheduledContext = scheduledAt
    ? `Scheduled for: ${new Date(scheduledAt).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })} WAT`
    : 'Posting time: not yet determined';

  const context = `PLATFORM: ${platform}
${scheduledContext}
TARGET AUDIENCE: ${audience}

CONTENT TO EVALUATE:
---
${contentText}
---

${topPerformers.length
  ? `HISTORICAL TOP PERFORMERS on ${platform} (for calibration):
${JSON.stringify(topPerformers, null, 2)}`
  : `No historical performance data available — use platform and industry benchmarks for calibration.`
}

Provide a detailed pre-publish performance prediction. Be specific about what will and won't work,
and give concrete edits that could increase the predicted engagement rate.`;

  const response = await createMessage({
    model: MODELS.PRIMARY,
    maxTokens: 2000,
    system: [cachedSystemBlock(systemPrompt)],
    messages: [{ role: 'user', content: context }],
    tools: [PREDICTION_TOOL],
    label: `Content Predictor: ${platform}`,
  });

  const prediction = extractToolInput(response);
  if (!prediction) {
    logger.warn('Content predictor returned no output');
    return { error: 'Prediction failed', platform };
  }

  const result = {
    ...prediction,
    platform,
    contentId,
    predictedAt: new Date().toISOString(),
  };

  // Persist to Supabase for dashboard queries
  await _persistPrediction(tenantId, contentId, platform, result).catch((err) =>
    logger.warn('Failed to persist content prediction', { error: err.message })
  );

  return result;
}

async function _persistPrediction(tenantId, contentId, platform, prediction) {
  if (!tenantId) return;
  await supabaseQuery((db) =>
    db.from('content_predictions').insert({
      tenant_id: tenantId,
      content_id: contentId,
      platform,
      predicted_engagement_rate: prediction.predictedEngagementRate,
      predicted_reach: prediction.predictedReach,
      viral_potential: prediction.viralPotential,
      confidence: prediction.confidence,
      payload: prediction,
    })
  );
}

module.exports = { predictContentPerformance };
