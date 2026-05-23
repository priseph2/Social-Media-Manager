'use strict';

const { createMessage, cachedSystemBlock, extractText, extractToolInput } = require('../../services/anthropic-client');
const { MODELS } = require('../../config/constants');

// ── Shared system prompt factory ──────────────────────────────────────────────

function buildSystemPrompt(brandName, industry) {
  return `You are the intelligence officer for ${brandName}'s digital marketing team (${industry} industry).

You write performance briefings that are:
- Concise and executive-ready (readable in 3–5 minutes for the structured report; 8–12 minutes for the monthly narrative)
- Balanced: celebrate wins AND flag concerns honestly
- Actionable: every finding has a "so what?" and a recommended next step
- Forward-looking: what should the team prioritise this week/month?

Tone: Confident, precise, professional — like a trusted strategic advisor, not a data dump.
You understand the ${industry} landscape and the specific competitive dynamics of operating in this market.`;
}

// ── Structured weekly/period report ──────────────────────────────────────────

const REPORT_TOOL = {
  name: 'submit_performance_report',
  description: 'Submit the structured performance report',
  input_schema: {
    type: 'object',
    properties: {
      period: { type: 'string' },
      headline: { type: 'string', description: 'One-sentence summary of the period' },
      overallScore: {
        type: 'object',
        properties: {
          score: { type: 'number', description: '0–100 overall performance score' },
          trend: { type: 'string', enum: ['improving', 'stable', 'declining'] },
          context: { type: 'string' },
        },
      },
      channels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            status: { type: 'string', enum: ['on_track', 'above_target', 'needs_attention', 'critical', 'no_data'] },
            keyMetric: { type: 'string' },
            vsTarget: { type: 'string' },
            vsBenchmark: { type: 'string', description: 'Performance vs industry benchmark (optional)' },
            insight: { type: 'string' },
          },
          required: ['name', 'status', 'insight'],
        },
      },
      wins: { type: 'array', items: { type: 'string' }, description: 'Top 3 achievements', maxItems: 3 },
      concerns: { type: 'array', items: { type: 'string' }, description: 'Issues needing attention', maxItems: 3 },
      priorityActions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            owner: { type: 'string' },
            urgency: { type: 'string', enum: ['this_week', 'this_month', 'when_possible'] },
            expectedImpact: { type: 'string' },
          },
        },
        maxItems: 5,
      },
      nextWeekFocus: { type: 'string' },
    },
    required: ['period', 'headline', 'channels', 'wins', 'concerns', 'priorityActions', 'nextWeekFocus'],
  },
};

/**
 * Generates a structured performance report (JSON + formatted text).
 * Used for weekly reports and the summary section of monthly reports.
 *
 * @param {Object} metricsData  — aggregated metrics
 * @param {string} period       — e.g. 'Week of 23 May 2026'
 * @param {Object} [forecast]   — optional forecast data
 * @param {Object} [brandConfig] — brand config for personalisation
 * @param {Object} [benchmark]  — competitor benchmark results
 */
async function generateReport(metricsData, period, forecast = null, brandConfig = {}, benchmark = null) {
  const brandName = brandConfig?.identity?.name || 'Your brand';
  const industry = brandConfig?.identity?.positioning || 'retail';

  const targets = `
PERFORMANCE TARGETS:
- Instagram engagement rate: 3–5%
- Email open rate: 20–25%
- Email click rate: 2–3%
- Customer service response time: <2 hours
- CS resolution rate: 80%+
- E-commerce conversion rate: 0.5–2% (growing)`;

  const benchmarkSection = benchmark
    ? `\n\nINDUSTRY BENCHMARK SNAPSHOT:\n${JSON.stringify({
        overallPosition: benchmark.overallPosition,
        competitiveAdvantages: benchmark.competitiveAdvantages,
        gapsToClose: benchmark.gapsToClose,
      }, null, 2)}`
    : '';

  const response = await createMessage({
    model: MODELS.PRIMARY,
    maxTokens: 2500,
    system: [cachedSystemBlock(buildSystemPrompt(brandName, industry))],
    messages: [{
      role: 'user',
      content: `Generate a performance report for ${brandName}.\n\nPERIOD: ${period}\n\nMETRICS DATA:\n${JSON.stringify(metricsData, null, 2)}${forecast ? `\n\nFORECAST:\n${JSON.stringify(forecast, null, 2)}` : ''}${benchmarkSection}\n\n${targets}`,
    }],
    tools: [REPORT_TOOL],
    label: `Report Generator: ${period}`,
  });

  const report = extractToolInput(response);
  if (!report) throw new Error('Report generator returned no output');

  return { ...report, generatedAt: new Date().toISOString(), period, rawMetrics: metricsData };
}

// ── Full monthly narrative (long-form markdown prose) ─────────────────────────

/**
 * Generates a complete, long-form monthly performance narrative in markdown.
 * This is the "board-ready" report — 8–12 minutes to read, full context and story.
 *
 * Sections:
 *  1. Executive Summary
 *  2. Month at a Glance (key numbers)
 *  3. Channel Deep-Dives (Social, Email, Website, E-commerce, Customer Service)
 *  4. Competitive Position
 *  5. Revenue & Attribution Highlights
 *  6. Content Performance Analysis
 *  7. Next Month Strategy
 *  8. Appendix: Raw Metrics
 *
 * @param {Object} params
 * @param {string} params.period              — 'YYYY-MM' or 'May 2026'
 * @param {Object} params.metricsHistory      — 30 days of Metrics from MongoDB
 * @param {Object} params.aggregated          — today's/period aggregated snapshot
 * @param {Array}  params.emailCampaigns      — campaigns sent this period
 * @param {Object} params.forecast            — forecast for next period
 * @param {Object} params.benchmark           — competitor benchmark results
 * @param {Array}  params.topContent          — top content pieces by engagement
 * @param {Array}  params.topAttributed       — top revenue-attributed content pieces
 * @param {Object} params.brandConfig         — brand identity and voice
 */
async function generateMonthlyNarrative(params) {
  const {
    period, metricsHistory = [], aggregated = {}, emailCampaigns = [],
    forecast = null, benchmark = null, topContent = [], topAttributed = [],
    brandConfig = {},
  } = params;

  const brandName = brandConfig?.identity?.name || 'Your brand';
  const industry = brandConfig?.identity?.positioning || 'retail';
  const audience = brandConfig?.audience?.primary || '';

  const systemPrompt = buildSystemPrompt(brandName, industry) + `

For monthly narratives you write with depth and nuance.
Use headers (##, ###), bullet points, and emphasis where it improves readability.
Include specific numbers — percentages, absolute values, comparisons.
Every section ends with a clear "What this means for next month" insight.
The tone should feel like a senior strategist who deeply understands the brand, not a generic analytics tool.`;

  const dataContext = `
## DATA PACKAGE FOR ${period.toUpperCase()}

### Aggregated Period Metrics
${JSON.stringify(aggregated, null, 2)}

### Email Campaigns (${emailCampaigns.length} sent)
${emailCampaigns.length ? JSON.stringify(emailCampaigns.slice(0, 10), null, 2) : 'None sent this period'}

### Competitive Position vs ${industry} Industry
${benchmark ? JSON.stringify({ overallPosition: benchmark.overallPosition, channelComparisons: benchmark.channelComparisons, competitiveAdvantages: benchmark.competitiveAdvantages, gapsToClose: benchmark.gapsToClose }, null, 2) : 'Benchmark data not available'}

### Top Performing Content
${topContent.length ? JSON.stringify(topContent.slice(0, 5).map((c) => ({ id: c._id, platform: c.platform, engagementRate: c.performance?.engagementRate, reach: c.performance?.reach, text: (c.variations?.[0]?.text || '').slice(0, 200) })), null, 2) : 'No performance data available'}

### Top Revenue-Attributed Content
${topAttributed.length ? JSON.stringify(topAttributed.slice(0, 5), null, 2) : 'No attribution data available'}

### Forecast for Next Period
${forecast ? JSON.stringify(forecast, null, 2) : 'Insufficient data for forecast'}

### Target Audience
${audience || 'Not defined'}`;

  const instruction = `Write a complete monthly performance report for ${brandName} for the period: ${period}.

Structure:
# ${brandName} — Monthly Performance Report: ${period}
## Executive Summary
## Month at a Glance
## Social Media Performance
## Email Marketing Performance
## Website & Traffic
## E-commerce & Revenue
## Customer Service
## Competitive Position (vs ${industry} industry benchmarks)
## Revenue Attribution & Content ROI
## Top Content Analysis
## Strategy for Next Month
## Key Actions & Owners

Write in full paragraphs with specific numbers. Be honest about underperformance.
End with a "3 things to stop, 3 things to start, 3 things to keep" summary.`;

  const response = await createMessage({
    model: MODELS.PRIMARY,
    maxTokens: 6000,
    system: [cachedSystemBlock(systemPrompt)],
    messages: [
      { role: 'user', content: dataContext },
      { role: 'assistant', content: 'I have reviewed all the data. I\'ll now write the complete monthly performance report.' },
      { role: 'user', content: instruction },
    ],
    label: `Monthly Narrative: ${period}`,
  });

  const markdown = extractText(response);
  if (!markdown) throw new Error('Monthly narrative returned empty response');

  return {
    period,
    brandName,
    markdown,
    generatedAt: new Date().toISOString(),
    wordCount: markdown.split(/\s+/).length,
  };
}

// ── Text formatter for structured report ──────────────────────────────────────

function formatReportAsText(report) {
  const statusEmoji = { on_track: '✅', above_target: '🚀', needs_attention: '⚠️', critical: '🚨', no_data: '⬜' };
  const lines = [
    `PERFORMANCE BRIEF — ${report.period}`,
    `Generated: ${new Date(report.generatedAt).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })} WAT`,
    ``,
    `━━━ HEADLINE ━━━`,
    report.headline || '',
    ``,
    `Overall Score: ${report.overallScore?.score ?? 'N/A'}/100 (${report.overallScore?.trend || ''})`,
    report.overallScore?.context || '',
    ``,
    `━━━ CHANNELS ━━━`,
    ...(report.channels || []).map((c) =>
      `${statusEmoji[c.status] || '•'} ${c.name}: ${c.keyMetric || ''} ${c.vsTarget ? `(${c.vsTarget})` : ''}${c.vsBenchmark ? ` [vs industry: ${c.vsBenchmark}]` : ''}\n   ${c.insight}`
    ),
    ``,
    `━━━ WINS ━━━`,
    ...(report.wins || []).map((w) => `✓ ${w}`),
    ``,
    `━━━ CONCERNS ━━━`,
    ...(report.concerns || []).map((c) => `⚠ ${c}`),
    ``,
    `━━━ PRIORITY ACTIONS ━━━`,
    ...(report.priorityActions || []).map((a, i) =>
      `${i + 1}. [${a.urgency}] ${a.action}\n   Owner: ${a.owner} | Impact: ${a.expectedImpact}`
    ),
    ``,
    `━━━ NEXT WEEK FOCUS ━━━`,
    report.nextWeekFocus || '',
    ``,
    `─────────────────────────────────────`,
  ];
  return lines.join('\n');
}

module.exports = { generateReport, generateMonthlyNarrative, formatReportAsText };
