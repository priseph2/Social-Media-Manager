'use strict';

// Generic system prompt — same for all tenants, benefits from Anthropic prompt caching
const BASE_SYSTEM = `You are an expert content creator for a premium brand. Your role is to create exceptional content that authentically represents the brand, deeply engages its target audience, and drives meaningful business results.

Every piece of content you create must:
- Speak directly to the brand's specific target audience
- Authentically reflect the brand's unique voice and personality
- Balance aspiration with genuine connection (never cold or distant)
- Educate and inspire, not just sell
- Be specific and evocative — concrete details over generic adjectives
- Feel personally crafted, not AI-generated

You adapt completely to the brand guidelines provided. When in doubt, err on the side of sophistication and authenticity.`;

// Dynamic context block — varies per tenant, populated at job time
function guidelinesContext(brandConfig) {
  const brand = brandConfig || {};
  const identity = brand.identity || {};
  const voice = brand.voice || {};
  const messaging = brand.messaging || {};
  const compliance = brand.compliance || {};

  return [
    `BRAND: ${identity.name || 'The Brand'}`,
    identity.tagline ? `TAGLINE: ${identity.tagline}` : '',
    identity.positioning ? `POSITIONING: ${identity.positioning}` : '',
    identity.markets?.length ? `MARKETS: ${identity.markets.join(', ')}` : '',
    '',
    'BRAND VOICE:',
    voice.tone ? `Tone: ${voice.tone}` : '',
    voice.personality?.length ? `Personality: ${voice.personality.join(', ')}` : '',
    '',
    voice.doList?.length ? `DO:\n${voice.doList.map((d) => `• ${d}`).join('\n')}` : '',
    voice.dontList?.length ? `\nDO NOT:\n${voice.dontList.map((d) => `• ${d}`).join('\n')}` : '',
    '',
    messaging.corePillars?.length
      ? `MESSAGING PILLARS:\n${messaging.corePillars.map((p) => `• ${p}`).join('\n')}`
      : '',
    compliance.pricing ? `\nPRICING NOTE: ${compliance.pricing}` : '',
  ].filter(Boolean).join('\n');
}

// ── Tool schemas (unchanged) ──────────────────────────────────────────────────

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
      keyDates: { type: 'array', items: { type: 'string' } },
      emailCampaigns: { type: 'array', items: { type: 'string' } },
    },
    required: ['month', 'theme', 'weeklyBreakdown'],
  },
};

// ── TikTok / Reels / Shorts script tool ──────────────────────────────────────

const TIKTOK_SCRIPT_TOOL = {
  name: 'submit_tiktok_script',
  description: 'Submit a complete short-form video script for TikTok, Instagram Reels, or YouTube Shorts',
  input_schema: {
    type: 'object',
    properties: {
      hook: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'First spoken line or on-screen text — delivered within 3 seconds' },
          visualAction: { type: 'string', description: 'What is happening on screen during the hook' },
          hookType: { type: 'string', enum: ['question', 'shock', 'story', 'trend', 'controversy', 'tutorial'] },
        },
        required: ['text', 'visualAction', 'hookType'],
      },
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sceneNumber: { type: 'number' },
            duration: { type: 'string', description: 'Timestamp range e.g. "0:03-0:08"' },
            action: { type: 'string', description: 'What is visually happening on screen' },
            dialogue: { type: 'string', description: 'Spoken words or on-screen text overlay' },
            transition: { type: 'string', description: 'How this scene transitions to the next' },
          },
          required: ['sceneNumber', 'duration', 'action', 'dialogue', 'transition'],
        },
      },
      totalDuration: { type: 'string', description: 'Total video length e.g. "0:45"' },
      captions: {
        type: 'array',
        description: 'Three caption variants for the post',
        minItems: 3,
        maxItems: 3,
        items: { type: 'string' },
      },
      hashtags: {
        type: 'array',
        description: '10-15 hashtags mixing niche + trending',
        minItems: 10,
        maxItems: 15,
        items: { type: 'string' },
      },
      trendingAudioSuggestion: { type: 'string', description: 'Describe vibe/tempo/genre to search for — no specific tracks' },
      cta: { type: 'string', description: 'End-of-video call to action' },
      productionNotes: { type: 'string', description: 'Lighting, setting, props, camera angles, b-roll suggestions' },
      contentPillar: {
        type: 'string',
        enum: ['education', 'entertainment', 'inspiration', 'product_showcase', 'behind_the_scenes', 'trend_participation'],
      },
    },
    required: ['hook', 'scenes', 'totalDuration', 'captions', 'hashtags', 'cta', 'contentPillar'],
  },
};

// ── Designer / Canva image brief tool ────────────────────────────────────────

const IMAGE_BRIEF_TOOL = {
  name: 'submit_image_brief',
  description: 'Submit a detailed image brief for designer or Canva handoff',
  input_schema: {
    type: 'object',
    properties: {
      format: {
        type: 'object',
        properties: {
          dimensions: { type: 'string', description: 'Pixel dimensions e.g. "1080x1080"' },
          aspectRatio: { type: 'string', description: 'e.g. "1:1", "9:16"' },
          platform: { type: 'string', description: 'e.g. "Instagram Feed", "Instagram Story"' },
          fileType: { type: 'string', description: 'e.g. "PNG", "JPG"' },
        },
        required: ['dimensions', 'aspectRatio', 'platform', 'fileType'],
      },
      concept: { type: 'string', description: 'Core visual idea in one sentence' },
      moodKeywords: {
        type: 'array',
        description: '5-8 adjectives defining tone and aesthetic',
        minItems: 5,
        maxItems: 8,
        items: { type: 'string' },
      },
      colorPalette: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string', description: 'e.g. "primary", "accent", "background"' },
            color: { type: 'string', description: 'Hex code or descriptive name' },
            usage: { type: 'string', description: 'Where this colour is applied' },
          },
          required: ['role', 'color', 'usage'],
        },
      },
      typography: {
        type: 'object',
        properties: {
          headline: { type: 'string', description: 'Font style for main headline' },
          body: { type: 'string', description: 'Font style for body copy' },
          copyOverlay: { type: 'string', description: 'Exact text to appear on the image' },
        },
        required: ['headline', 'body', 'copyOverlay'],
      },
      visualElements: { type: 'array', items: { type: 'string' }, description: 'Props, backgrounds, textures, overlays' },
      photographyOrIllustration: {
        type: 'string',
        enum: ['photography', 'illustration', 'mixed', 'graphic_design', 'ugc_style'],
      },
      compositionNotes: { type: 'string', description: 'Layout, framing, focal point guidance' },
      brandElements: {
        type: 'object',
        properties: {
          logoPlacement: { type: 'string' },
          brandColors: { type: 'boolean' },
          tagline: { type: 'string' },
        },
        required: ['logoPlacement', 'brandColors'],
      },
      referenceStyle: { type: 'string', description: 'Aesthetic references without copyrighted works' },
      canvaTemplateCategory: { type: 'string', description: 'Canva search term to start from' },
      priority: { type: 'string', enum: ['hero', 'supporting', 'story', 'ad'] },
      designerNotes: { type: 'string', description: 'Special instructions and accessibility notes' },
    },
    required: ['format', 'concept', 'moodKeywords', 'colorPalette', 'typography', 'photographyOrIllustration', 'compositionNotes'],
  },
};

// ── Content Repurposing tool ──────────────────────────────────────────────────

const REPURPOSE_TOOL = {
  name: 'submit_repurposed_content',
  description: 'Submit platform-optimised posts generated from repurposed source content',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Brief 2-3 sentence summary of the key message from the source content',
      },
      posts: {
        type: 'array',
        description: 'One optimised post per requested platform',
        items: {
          type: 'object',
          properties: {
            platform: { type: 'string', description: 'Social platform name (e.g. instagram, linkedin)' },
            caption: { type: 'string', description: 'Full platform-optimised caption text' },
            hashtags: { type: 'array', items: { type: 'string' } },
            angle: { type: 'string', description: 'Creative angle or hook used (e.g. educational, inspirational, contrarian)' },
          },
          required: ['platform', 'caption', 'hashtags', 'angle'],
        },
      },
      keyInsights: {
        type: 'array',
        description: '3-5 key takeaways extracted and reframed for the brand audience',
        minItems: 3,
        maxItems: 5,
        items: { type: 'string' },
      },
    },
    required: ['summary', 'posts', 'keyInsights'],
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
  TIKTOK_SCRIPT_TOOL,
  IMAGE_BRIEF_TOOL,
  REPURPOSE_TOOL,
};
