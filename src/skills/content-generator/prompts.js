'use strict';

const BRAND_GUIDELINES = require('../../config/brand-guidelines');

const BASE_SYSTEM = `You are the Content Generator for Cascades Luxury — West Africa's premier luxury fragrance and beauty retailer.

You create exceptional content that positions Cascades Luxury as the authority on luxury fragrance in West Africa. Every piece you create must:
- Speak to affluent African professionals aged 25-45
- Balance aspiration with warmth (never cold or distant)
- Educate and inspire, not just sell
- Be specific and evocative — use sensory language
- Feel personally crafted, not AI-generated

Brand Voice Essence:
"We are the trusted luxury advisor, the friend who knows everything about fragrance and wants you to experience the finest."`;

const guidelinesContext = () =>
  `BRAND GUIDELINES (version ${BRAND_GUIDELINES.version}):\n${JSON.stringify(BRAND_GUIDELINES.voice, null, 2)}\n\nMessaging Pillars:\n${BRAND_GUIDELINES.messaging.corePillars.map((p) => `• ${p}`).join('\n')}`;

// ── Tool schemas for structured outputs ───────────────────────────────────────

const SOCIAL_CAPTIONS_TOOL = {
  name: 'submit_social_captions',
  description: 'Submit 5 social media caption variations for the given post',
  input_schema: {
    type: 'object',
    properties: {
      captions: {
        type: 'array',
        minItems: 5,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The caption text' },
            angle: { type: 'string', description: 'The creative angle used (e.g., emotional, educational, aspirational)' },
            hashtags: { type: 'array', items: { type: 'string' } },
            engagementHook: { type: 'string', description: 'Why this caption should drive engagement' },
          },
          required: ['text', 'angle', 'hashtags', 'engagementHook'],
        },
      },
      recommendedIndex: { type: 'number', description: 'Index (0-4) of the strongest caption' },
      optimalPostingContext: { type: 'string', description: 'When and how to use these captions' },
    },
    required: ['captions', 'recommendedIndex'],
  },
};

const EMAIL_TOOL = {
  name: 'submit_email_campaign',
  description: 'Submit a complete email campaign with A/B test variants',
  input_schema: {
    type: 'object',
    properties: {
      subjectLines: {
        type: 'array',
        minItems: 2,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            approach: { type: 'string', description: 'e.g., curiosity, FOMO, benefit-driven' },
            previewText: { type: 'string', description: 'Email preview text (50-90 chars)' },
          },
          required: ['text', 'approach', 'previewText'],
        },
      },
      emailBody: {
        type: 'object',
        properties: {
          openingHook: { type: 'string' },
          mainContent: { type: 'string' },
          bulletPoints: { type: 'array', items: { type: 'string' } },
          callToAction: { type: 'string' },
          signOff: { type: 'string' },
        },
        required: ['openingHook', 'mainContent', 'callToAction'],
      },
      estimatedOpenRate: { type: 'string' },
      targetSegment: { type: 'string' },
    },
    required: ['subjectLines', 'emailBody'],
  },
};

const BLOG_POST_TOOL = {
  name: 'submit_blog_post',
  description: 'Submit a complete SEO-optimised blog post',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      metaDescription: { type: 'string', description: '150-160 characters for SEO' },
      slug: { type: 'string', description: 'URL-friendly slug' },
      content: { type: 'string', description: 'Full HTML-ready blog post (500-700 words)' },
      targetKeyword: { type: 'string' },
      internalLinkSuggestions: { type: 'array', items: { type: 'string' } },
      socialSnippets: { type: 'array', items: { type: 'string' }, description: '3 short snippets to promote the post' },
    },
    required: ['title', 'metaDescription', 'content', 'targetKeyword'],
  },
};

const PRODUCT_DESCRIPTION_TOOL = {
  name: 'submit_product_description',
  description: 'Submit an optimised product description',
  input_schema: {
    type: 'object',
    properties: {
      headline: { type: 'string', description: 'Compelling product headline' },
      shortDescription: { type: 'string', description: '1-2 sentence hook' },
      fullDescription: { type: 'string', description: '150-word luxury description' },
      bulletPoints: { type: 'array', items: { type: 'string' }, description: '4-6 benefit bullets' },
      seoTags: { type: 'array', items: { type: 'string' } },
      luxuryAngle: { type: 'string', description: 'The emotional/lifestyle angle used' },
    },
    required: ['headline', 'shortDescription', 'fullDescription', 'bulletPoints'],
  },
};

const CONTENT_CALENDAR_TOOL = {
  name: 'submit_content_calendar',
  description: 'Submit a 30-day content calendar',
  input_schema: {
    type: 'object',
    properties: {
      month: { type: 'string' },
      theme: { type: 'string' },
      weeklyBreakdown: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            week: { type: 'number' },
            focus: { type: 'string' },
            posts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  day: { type: 'string' },
                  platform: { type: 'string' },
                  contentType: { type: 'string' },
                  angle: { type: 'string' },
                  topic: { type: 'string' },
                },
              },
            },
          },
        },
      },
      keyDates: { type: 'array', items: { type: 'string' }, description: 'Important dates, holidays, or opportunities' },
      emailCampaigns: { type: 'array', items: { type: 'string' }, description: 'Recommended email campaigns for the month' },
    },
    required: ['month', 'theme', 'weeklyBreakdown'],
  },
};

module.exports = {
  BASE_SYSTEM,
  guidelinesContext,
  SOCIAL_CAPTIONS_TOOL,
  EMAIL_TOOL,
  BLOG_POST_TOOL,
  PRODUCT_DESCRIPTION_TOOL,
  CONTENT_CALENDAR_TOOL,
};
