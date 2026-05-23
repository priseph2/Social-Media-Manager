'use strict';

const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { MODELS } = require('../../config/constants');
const logger = require('../../utils/logger').forSkill('competitor-benchmark');

/**
 * Industry benchmark data (research-based, updated periodically).
 * Keyed to the `industry` values from the onboarding wizard.
 */
const INDUSTRY_BENCHMARKS = {
  'Luxury & Fashion': {
    social: {
      instagram: { avgEngagementRate: 1.8, topPerformerRate: 4.0, unit: '%', note: 'Luxury brands avg 1.5-3% on Instagram' },
      facebook:  { avgEngagementRate: 0.6, topPerformerRate: 1.5, unit: '%' },
      tiktok:    { avgEngagementRate: 5.5, topPerformerRate: 12.0, unit: '%' },
      twitter:   { avgEngagementRate: 0.3, topPerformerRate: 0.8, unit: '%' },
      pinterest: { avgEngagementRate: 1.2, topPerformerRate: 3.0, unit: '%' },
    },
    email: { avgOpenRate: 30.0, avgClickRate: 2.2, unit: '%', note: 'Luxury retail email averages 28-35% open rate' },
    ecommerce: { avgConversionRate: 1.2, avgOrderValue: 280, unit: ['%', 'USD'] },
    customerService: { avgResponseTimeMin: 90, resolutionRate: 85, unit: ['min', '%'] },
  },
  'Beauty & Cosmetics': {
    social: {
      instagram: { avgEngagementRate: 2.4, topPerformerRate: 5.5, unit: '%' },
      facebook:  { avgEngagementRate: 0.8, topPerformerRate: 2.0, unit: '%' },
      tiktok:    { avgEngagementRate: 8.0, topPerformerRate: 18.0, unit: '%', note: 'Beauty is top TikTok category' },
      twitter:   { avgEngagementRate: 0.4, topPerformerRate: 1.0, unit: '%' },
      pinterest: { avgEngagementRate: 2.0, topPerformerRate: 4.5, unit: '%' },
    },
    email: { avgOpenRate: 26.5, avgClickRate: 3.0, unit: '%' },
    ecommerce: { avgConversionRate: 1.8, avgOrderValue: 85, unit: ['%', 'USD'] },
    customerService: { avgResponseTimeMin: 60, resolutionRate: 88, unit: ['min', '%'] },
  },
  'Food & Beverage': {
    social: {
      instagram: { avgEngagementRate: 1.6, topPerformerRate: 3.5, unit: '%' },
      facebook:  { avgEngagementRate: 0.9, topPerformerRate: 2.2, unit: '%' },
      tiktok:    { avgEngagementRate: 6.0, topPerformerRate: 15.0, unit: '%' },
      twitter:   { avgEngagementRate: 0.5, topPerformerRate: 1.2, unit: '%' },
    },
    email: { avgOpenRate: 28.0, avgClickRate: 2.8, unit: '%' },
    ecommerce: { avgConversionRate: 2.0, avgOrderValue: 55, unit: ['%', 'USD'] },
    customerService: { avgResponseTimeMin: 45, resolutionRate: 90, unit: ['min', '%'] },
  },
  'Health & Wellness': {
    social: {
      instagram: { avgEngagementRate: 2.2, topPerformerRate: 5.0, unit: '%' },
      facebook:  { avgEngagementRate: 1.0, topPerformerRate: 2.5, unit: '%' },
      tiktok:    { avgEngagementRate: 7.0, topPerformerRate: 16.0, unit: '%' },
    },
    email: { avgOpenRate: 25.0, avgClickRate: 2.5, unit: '%' },
    ecommerce: { avgConversionRate: 1.5, avgOrderValue: 95, unit: ['%', 'USD'] },
    customerService: { avgResponseTimeMin: 60, resolutionRate: 87, unit: ['min', '%'] },
  },
  'Technology': {
    social: {
      instagram: { avgEngagementRate: 0.9, topPerformerRate: 2.2, unit: '%' },
      facebook:  { avgEngagementRate: 0.4, topPerformerRate: 1.0, unit: '%' },
      twitter:   { avgEngagementRate: 0.6, topPerformerRate: 1.5, unit: '%' },
      linkedin:  { avgEngagementRate: 1.8, topPerformerRate: 4.0, unit: '%' },
    },
    email: { avgOpenRate: 22.0, avgClickRate: 2.8, unit: '%' },
    ecommerce: { avgConversionRate: 1.0, avgOrderValue: 350, unit: ['%', 'USD'] },
    customerService: { avgResponseTimeMin: 120, resolutionRate: 82, unit: ['min', '%'] },
  },
  'Retail': {
    social: {
      instagram: { avgEngagementRate: 1.5, topPerformerRate: 3.5, unit: '%' },
      facebook:  { avgEngagementRate: 0.7, topPerformerRate: 1.8, unit: '%' },
      tiktok:    { avgEngagementRate: 5.0, topPerformerRate: 11.0, unit: '%' },
    },
    email: { avgOpenRate: 23.0, avgClickRate: 2.5, unit: '%' },
    ecommerce: { avgConversionRate: 1.8, avgOrderValue: 120, unit: ['%', 'USD'] },
    customerService: { avgResponseTimeMin: 60, resolutionRate: 85, unit: ['min', '%'] },
  },
};

// Generic fallback for unknown industries
const DEFAULT_BENCHMARKS = INDUSTRY_BENCHMARKS['Retail'];

const BENCHMARK_TOOL = {
  name: 'submit_benchmark_analysis',
  description: 'Submit a structured competitor benchmark analysis',
  input_schema: {
    type: 'object',
    properties: {
      overallPosition: {
        type: 'string',
        enum: ['leading', 'on_par', 'lagging', 'insufficient_data'],
        description: 'How the brand is positioned vs industry benchmarks',
      },
      channelComparisons: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            channel: { type: 'string' },
            metric: { type: 'string' },
            brandValue: { type: 'string' },
            industryAvg: { type: 'string' },
            topPerformer: { type: 'string' },
            gap: { type: 'string', description: 'Gap vs industry average — positive means ahead' },
            assessment: { type: 'string', enum: ['outperforming', 'on_par', 'underperforming', 'no_data'] },
            actionableInsight: { type: 'string' },
          },
          required: ['channel', 'metric', 'assessment', 'actionableInsight'],
        },
      },
      competitiveAdvantages: {
        type: 'array', items: { type: 'string' }, maxItems: 3,
        description: 'Areas where the brand outperforms competitors',
      },
      gapsToClose: {
        type: 'array', items: { type: 'string' }, maxItems: 3,
        description: 'Priority gaps that are dragging performance below industry average',
      },
      marketOpportunities: {
        type: 'array', items: { type: 'string' }, maxItems: 3,
        description: 'Market opportunities given the competitive landscape',
      },
      priorityRecommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            recommendation: { type: 'string' },
            expectedImpact: { type: 'string' },
            timeframe: { type: 'string', enum: ['this_week', 'this_month', 'this_quarter'] },
          },
        },
        maxItems: 4,
      },
      benchmarkDate: { type: 'string' },
    },
    required: ['overallPosition', 'channelComparisons', 'competitiveAdvantages', 'gapsToClose', 'priorityRecommendations'],
  },
};

/**
 * Returns the benchmark set for the given industry string.
 * Falls back to DEFAULT_BENCHMARKS for unknown industries.
 */
function getBenchmarks(industry) {
  return INDUSTRY_BENCHMARKS[industry] || DEFAULT_BENCHMARKS;
}

/**
 * Compares tenant metrics against industry benchmarks and asks Claude to
 * produce a structured competitive analysis.
 *
 * @param {Object} tenantMetrics  — aggregated metrics object from data-aggregator
 * @param {string} industry       — industry string from brand config (e.g. 'Luxury & Fashion')
 * @param {string} brandName      — brand name for the system prompt
 */
async function runBenchmarkAnalysis(tenantMetrics, industry, brandName = 'Your brand') {
  const benchmarks = getBenchmarks(industry);

  const systemPrompt = `You are a competitive intelligence analyst for ${brandName} (${industry} industry).

You compare ${brandName}'s actual performance against verified industry benchmarks.
Be precise about gaps: quantify them, contextualise them for a ${industry} brand, and recommend concrete actions.
Never fabricate metrics — if the brand has no data for a channel, say so explicitly.`;

  const context = `INDUSTRY: ${industry}
BRAND: ${brandName}

INDUSTRY BENCHMARKS:
${JSON.stringify(benchmarks, null, 2)}

${brandName}'s CURRENT METRICS:
${JSON.stringify(tenantMetrics, null, 2)}

Compare the brand's actual metrics against every available benchmark.
Identify where they lead, where they're on par, and where they are falling behind.
Focus on the most impactful gaps — not every metric equally matters.`;

  try {
    const response = await createMessage({
      model: MODELS.PRIMARY,
      maxTokens: 2500,
      system: [cachedSystemBlock(systemPrompt)],
      messages: [{ role: 'user', content: context }],
      tools: [BENCHMARK_TOOL],
      label: `Competitor Benchmark: ${brandName}`,
    });

    const result = extractToolInput(response);
    if (!result) throw new Error('Benchmark analysis returned no output');

    return { ...result, industry, benchmarks, benchmarkDate: new Date().toISOString() };
  } catch (err) {
    logger.error('runBenchmarkAnalysis failed', { error: err.message });
    throw err;
  }
}

/**
 * Returns a simple diff object comparing brand metrics to industry averages.
 * Used as a lightweight summary without Claude inference.
 */
function quickBenchmarkDiff(tenantMetrics, industry) {
  const b = getBenchmarks(industry);
  const result = { industry, gaps: [], strengths: [] };

  const instEngagement = tenantMetrics?.social?.byPlatform?.instagram ?? null;
  if (instEngagement !== null) {
    const diff = instEngagement - b.social?.instagram?.avgEngagementRate;
    if (diff > 0.3) result.strengths.push(`Instagram engagement ${diff.toFixed(1)}pp above industry avg`);
    else if (diff < -0.5) result.gaps.push(`Instagram engagement ${Math.abs(diff).toFixed(1)}pp below industry avg`);
  }

  const emailOpen = tenantMetrics?.email?.avgOpenRate ?? null;
  if (emailOpen !== null) {
    const diff = emailOpen - b.email?.avgOpenRate;
    if (diff > 2) result.strengths.push(`Email open rate ${diff.toFixed(1)}pp above industry avg`);
    else if (diff < -3) result.gaps.push(`Email open rate ${Math.abs(diff).toFixed(1)}pp below industry avg`);
  }

  return result;
}

module.exports = { getBenchmarks, runBenchmarkAnalysis, quickBenchmarkDiff, INDUSTRY_BENCHMARKS };
