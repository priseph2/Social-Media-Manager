'use strict';

const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { supabaseQuery } = require('../../services/database/supabase-client');
const { MODELS } = require('../../config/constants');

// Cascades Luxury brand hashtags — always included (subset)
const BRAND_HASHTAGS = [
  '#CascadesLuxury',
  '#LuxuryFragrance',
  '#LuxuryInAfrica',
  '#NigeriaLuxury',
  '#AccraLuxury',
  '#AfricanLuxury',
  '#FragranceCommunity',
];

// Evergreen niche hashtags by category
const NICHE_HASHTAGS = {
  product: ['#PerfumeCollection', '#ScentOfTheDay', '#FragranceNotes', '#EauDeParfum', '#NicheFragrance', '#LuxuryPerfume'],
  lifestyle: ['#LuxuryLifestyle', '#LuxuryBeauty', '#AfricanStyle', '#ModernAfrican', '#WestAfricanFashion'],
  educational: ['#FragranceEducation', '#PerfumeTips', '#ScentGuide', '#FragranceFamily', '#PerfumeNerd'],
  seasonal: ['#SummerScents', '#WinterFragrance', '#SeasonalPerfume', '#HolidayGifts'],
};

const HASHTAG_TOOL = {
  name: 'submit_hashtag_strategy',
  description: 'Submit the optimal hashtag set for this post',
  input_schema: {
    type: 'object',
    properties: {
      primary: {
        type: 'array',
        items: { type: 'string' },
        description: '3-5 highest-impact hashtags for this specific post',
      },
      secondary: {
        type: 'array',
        items: { type: 'string' },
        description: '5-10 supporting hashtags — mix of niche and community',
      },
      trending: {
        type: 'array',
        items: { type: 'string' },
        description: '2-3 trending or timely hashtags relevant to the post',
      },
      avoidList: {
        type: 'array',
        items: { type: 'string' },
        description: 'Hashtags to avoid for this post (over-used, wrong audience)',
      },
      rationale: { type: 'string', description: 'Brief explanation of the hashtag strategy' },
    },
    required: ['primary', 'secondary', 'rationale'],
  },
};

const SYSTEM_PROMPT = `You are the hashtag strategist for Cascades Luxury — a premium fragrance retailer in West Africa.

Your goal: maximise reach and engagement while maintaining luxury positioning.

Rules:
- Never use generic mass-market tags (#sale, #cheap, #deal)
- Prioritise niche fragrance + African luxury communities
- Mix: 3-5 high-impact + 5-8 niche community + 2-3 trending
- Avoid overused tags with >50M posts (they offer no visibility)
- For Instagram, aim for 10-15 total hashtags
- Always include at least 2 African luxury or Nigeria/Ghana tags`;

/**
 * Generates an optimal hashtag set for a given piece of content using Claude.
 * @param {string} postContent - the caption text
 * @param {string} platform
 * @param {string} contentType - product, lifestyle, educational, promotional
 * @param {string[]} [previouslyUsed] - hashtags used in recent posts (to rotate)
 */
async function generateHashtags(postContent, platform, contentType, previouslyUsed = []) {
  const rotationNote = previouslyUsed.length
    ? `\nAvoid reusing these recently used hashtags (rotation strategy): ${previouslyUsed.slice(0, 20).join(', ')}`
    : '';

  const prompt = [
    `POST CONTENT:\n"${postContent.substring(0, 500)}"`,
    `Platform: ${platform}`,
    `Content type: ${contentType}`,
    rotationNote,
    `\nAlways include 1-2 of these brand hashtags: ${BRAND_HASHTAGS.slice(0, 4).join(', ')}`,
    `Niche hashtag pool to draw from: ${Object.values(NICHE_HASHTAGS).flat().join(', ')}`,
  ].filter(Boolean).join('\n');

  const response = await createMessage({
    model: MODELS.FAST,
    maxTokens: 600,
    system: [cachedSystemBlock(SYSTEM_PROMPT)],
    messages: [{ role: 'user', content: prompt }],
    tools: [HASHTAG_TOOL],
    label: `Hashtag Manager (${platform})`,
  });

  const output = extractToolInput(response);
  if (!output) return [...BRAND_HASHTAGS.slice(0, 3), ...NICHE_HASHTAGS[contentType] || []];

  return [
    ...output.primary,
    ...output.secondary,
    ...(output.trending || []),
  ].filter((h) => !output.avoidList?.includes(h));
}

/**
 * Retrieves recently used hashtags from Supabase to inform rotation.
 */
async function getRecentHashtags(platform, days = 14) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const result = await supabaseQuery((db) =>
    db
      .from('content_schedule')
      .select('hashtags')
      .eq('platform', platform)
      .gte('scheduled_at', since)
      .limit(30)
  );
  if (!result) return [];
  return result.flatMap((r) => r.hashtags || []);
}

module.exports = { generateHashtags, getRecentHashtags, BRAND_HASHTAGS };
