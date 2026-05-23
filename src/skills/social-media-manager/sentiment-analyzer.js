'use strict';

const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { MODELS } = require('../../config/constants');

const SYSTEM_PROMPT = `You are a sentiment analyzer for Cascades Luxury's social media team.

Analyze incoming comments and messages. Be accurate but consider cultural context:
- West African communication styles can be direct without being negative
- Excitement in Nigerian English ("This is mad expensive!" can mean "wow, impressive")
- Context matters — a question is not a complaint

Your output helps the team prioritize responses and detect potential crises early.`;

const SENTIMENT_TOOL = {
  name: 'submit_sentiment_analysis',
  description: 'Submit sentiment analysis for a comment or message',
  input_schema: {
    type: 'object',
    properties: {
      sentiment: {
        type: 'string',
        enum: ['positive', 'neutral', 'negative', 'angry', 'spam'],
      },
      sentimentScore: {
        type: 'number',
        description: '0-100 where 0=most negative/angry, 50=neutral, 100=most positive',
      },
      intent: {
        type: 'string',
        enum: ['compliment', 'question', 'complaint', 'purchase_intent', 'general', 'trolling', 'spam'],
      },
      themes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key topics mentioned (e.g., price, quality, shipping, product)',
      },
      requiresResponse: { type: 'boolean' },
      urgency: {
        type: 'string',
        enum: ['immediate', 'within_2hrs', 'within_24hrs', 'low'],
      },
      escalate: { type: 'boolean', description: 'True if this needs human review immediately' },
      escalationReason: { type: 'string' },
      suggestedResponseTone: {
        type: 'string',
        description: 'e.g., empathetic, informative, celebratory, diplomatic',
      },
    },
    required: ['sentiment', 'sentimentScore', 'intent', 'requiresResponse', 'urgency', 'escalate'],
  },
};

/**
 * Analyzes the sentiment of a single comment or message.
 * Returns structured sentiment data including urgency and escalation flag.
 */
async function analyzeComment(text, platform, context = '') {
  const prompt = [
    `Platform: ${platform}`,
    context ? `Post context: ${context}` : '',
    `\nCOMMENT:\n"${text}"`,
  ].filter(Boolean).join('\n');

  const response = await createMessage({
    model: MODELS.FAST,
    maxTokens: 400,
    system: [cachedSystemBlock(SYSTEM_PROMPT)],
    messages: [{ role: 'user', content: prompt }],
    tools: [SENTIMENT_TOOL],
    label: `Sentiment Analysis (${platform})`,
  });

  const result = extractToolInput(response);
  if (!result) {
    return { sentiment: 'neutral', sentimentScore: 50, intent: 'general', requiresResponse: false, urgency: 'low', escalate: false };
  }

  return { ...result, text, platform, analyzedAt: new Date().toISOString() };
}

/**
 * Batch-analyzes multiple comments efficiently.
 * Processes in parallel with a concurrency limit.
 */
async function analyzeComments(comments, platform, context = '', concurrency = 3) {
  const results = [];
  for (let i = 0; i < comments.length; i += concurrency) {
    const batch = comments.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((c) => analyzeComment(typeof c === 'string' ? c : c.text, platform, context).catch(() => null))
    );
    results.push(...batchResults.filter(Boolean));
  }
  return results;
}

module.exports = { analyzeComment, analyzeComments };
