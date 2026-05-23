'use strict';

const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { MODELS } = require('../../config/constants');

const SYSTEM_PROMPT = `You are the intelligence officer for Cascades Luxury's digital team.

You write performance briefings that are:
- Concise and executive-ready (readable in 3-5 minutes)
- Balanced: celebrate wins AND flag concerns honestly
- Actionable: every finding has a "so what?" and a recommended next step
- Forward-looking: what should the team prioritise this week?

Tone: Confident, precise, professional. Like a trusted strategic advisor, not a data dump.
You understand luxury retail in West Africa — context matters more than raw numbers.`;

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
          score: { type: 'number', description: '0-100 overall performance score' },
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
            owner: { type: 'string', description: 'Which skill or person should handle this' },
            urgency: { type: 'string', enum: ['this_week', 'this_month', 'when_possible'] },
            expectedImpact: { type: 'string' },
          },
        },
        maxItems: 5,
      },
      nextWeekFocus: { type: 'string', description: 'The single most important thing to focus on next week' },
    },
    required: ['period', 'headline', 'channels', 'wins', 'concerns', 'priorityActions', 'nextWeekFocus'],
  },
};

/**
 * Generates a structured performance report for a given period.
 * @param {Object} metricsData - aggregated metrics from data-aggregator
 * @param {string} period - e.g., 'Week of 23 May 2026', 'May 2026'
 * @param {Object} [forecast] - optional forecast data to include
 */
async function generateReport(metricsData, period, forecast = null) {
  const metricsStr = JSON.stringify(metricsData, null, 2);
  const forecastStr = forecast ? `\n\nFORECAST:\n${JSON.stringify(forecast, null, 2)}` : '';

  // Performance targets for context (from blueprint)
  const targets = `
PERFORMANCE TARGETS (for context):
- Instagram engagement rate: 3-5%
- Email open rate: 20-25%
- Email click rate: 2-3%
- Customer service response time: <2 hours
- Customer resolution rate: 80%+
- E-commerce conversion rate: 0.5-2% (growing)`;

  const response = await createMessage({
    model: MODELS.PRIMARY,
    maxTokens: 2500,
    system: [cachedSystemBlock(SYSTEM_PROMPT)],
    messages: [{
      role: 'user',
      content: `Generate a performance report for Cascades Luxury.\n\nPERIOD: ${period}\n\nMETRICS DATA:\n${metricsStr}${forecastStr}\n\n${targets}`,
    }],
    tools: [REPORT_TOOL],
    label: `Report Generator: ${period}`,
  });

  const report = extractToolInput(response);
  if (!report) throw new Error('Report generator returned no output');

  return {
    ...report,
    generatedAt: new Date().toISOString(),
    period,
    rawMetrics: metricsData,
  };
}

/**
 * Formats a report object into a human-readable plain text briefing.
 */
function formatReportAsText(report) {
  const statusEmoji = { on_track: '✅', above_target: '🚀', needs_attention: '⚠️', critical: '🚨', no_data: '⬜' };

  const lines = [
    `CASCADES LUXURY — PERFORMANCE BRIEF`,
    `${report.period}`,
    `Generated: ${new Date(report.generatedAt).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })} WAT`,
    ``,
    `━━━ HEADLINE ━━━`,
    report.headline,
    ``,
    `Overall Score: ${report.overallScore?.score || 'N/A'}/100 (${report.overallScore?.trend || ''})`,
    report.overallScore?.context || '',
    ``,
    `━━━ CHANNEL STATUS ━━━`,
    ...(report.channels || []).map((c) =>
      `${statusEmoji[c.status] || '•'} ${c.name}: ${c.keyMetric || ''} ${c.vsTarget ? `(${c.vsTarget})` : ''}\n   ${c.insight}`
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
    report.nextWeekFocus,
    ``,
    `─────────────────────────────────────`,
  ];

  return lines.join('\n');
}

module.exports = { generateReport, formatReportAsText };
