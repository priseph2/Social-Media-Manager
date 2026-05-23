'use strict';

const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { isMongoAvailable } = require('../../services/database/mongodb-client');
const Content = require('../../models/content.model');
const { MODELS } = require('../../config/constants');

const SYSTEM_PROMPT = `You are the newsletter editor for Cascades Luxury — a premium fragrance brand in West Africa.

You assemble the weekly newsletter from the week's content, analytics, and product news.
The newsletter should feel like a curated luxury magazine — not a promotional blast.

Structure for a great newsletter:
1. Personal opening from "the Cascades team" — warm, conversational
2. Feature story — this week's most interesting fragrance topic or arrival
3. 2-3 product highlights (not every product — curated selection)
4. Educational/lifestyle section — tips, guides, inspiration
5. Community section — customer story, UGC, review spotlight
6. Closing CTA — shop, discover, or read more

Tone: Think Vogue editorial meets your most knowledgeable luxury friend.
Length: 400-600 words total — newsletters that respect the reader's time get opened.`;

const NEWSLETTER_TOOL = {
  name: 'submit_newsletter',
  description: 'Submit the assembled weekly newsletter',
  input_schema: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Primary subject line' },
      previewText: { type: 'string', description: 'Email preview text (60-90 chars)' },
      alternativeSubjects: {
        type: 'array',
        maxItems: 2,
        items: { type: 'string' },
        description: 'A/B test subject line alternatives',
      },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['opening', 'feature', 'products', 'educational', 'community', 'cta'] },
            headline: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['type', 'body'],
        },
      },
      fullHtmlBody: {
        type: 'string',
        description: 'Complete newsletter HTML (plain sections separated by ---)',
      },
      wordCount: { type: 'number' },
      targetSegments: { type: 'array', items: { type: 'string' } },
    },
    required: ['subject', 'previewText', 'sections', 'fullHtmlBody'],
  },
};

/**
 * Assembles a weekly newsletter from:
 * 1. Recent high-performing content (from MongoDB)
 * 2. Product highlights (passed in)
 * 3. Weekly theme
 */
async function assembleNewsletter({ weekTheme, featuredProducts = [], topPosts = [], date = new Date() }) {
  // Pull top content from MongoDB if available
  let recentContent = topPosts;
  if (!recentContent.length && isMongoAvailable()) {
    const cutoff = new Date(date - 7 * 24 * 60 * 60 * 1000);
    const docs = await Content.find({
      createdAt: { $gte: cutoff },
      'brandReview.status': 'approved',
    })
      .sort({ 'performance.engagementRate': -1 })
      .limit(5)
      .lean();
    recentContent = docs.map((d) => ({
      type: d.type,
      content: d.variations?.[d.selectedVariation]?.text || '',
      performance: d.performance,
    }));
  }

  const monthName = date.toLocaleString('en-GB', { month: 'long' });
  const week = `Week of ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  const prompt = [
    `Assemble the Cascades Luxury weekly newsletter.`,
    `Date: ${week}`,
    `Theme: ${weekTheme || `${monthName} luxury lifestyle`}`,
    '',
    featuredProducts.length ? `Featured products this week:\n${featuredProducts.map((p) => `• ${p}`).join('\n')}` : '',
    recentContent.length
      ? `\nTop content from this week (for inspiration):\n${recentContent.map((c) => `[${c.type}] "${c.content?.substring(0, 150)}..."`).join('\n\n')}`
      : '',
    '\nCreate a newsletter that reads like a curated luxury editorial, not a promotional email.',
    'The HTML body should use simple text formatting markers (no complex HTML required — Mailchimp will template it).',
  ].filter(Boolean).join('\n');

  const response = await createMessage({
    model: MODELS.PRIMARY,
    maxTokens: 3000,
    system: [cachedSystemBlock(SYSTEM_PROMPT)],
    messages: [{ role: 'user', content: prompt }],
    tools: [NEWSLETTER_TOOL],
    label: 'Newsletter Assembler',
  });

  const output = extractToolInput(response);
  if (!output) throw new Error('Newsletter assembler returned no output');

  return {
    subject: output.subject,
    previewText: output.previewText,
    alternativeSubjects: output.alternativeSubjects || [],
    sections: output.sections,
    htmlBody: output.fullHtmlBody,
    wordCount: output.wordCount,
    targetSegments: output.targetSegments || ['all'],
    weekTheme,
    date: date.toISOString(),
  };
}

module.exports = { assembleNewsletter };
