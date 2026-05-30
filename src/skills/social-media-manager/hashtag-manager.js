'use strict';

const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { supabaseQuery } = require('../../services/database/supabase-client');
const { getBrandConfig } = require('../../services/brand-config');
const { MODELS } = require('../../config/constants');

// Generic niche hashtags by content type — used as a pool to draw from
// (no brand-specific tags here; those come from the tenant's brand config)
const NICHE_HASHTAGS = {
  product:     ['#ProductLaunch', '#NewArrival', '#ShopNow', '#MustHave'],
  lifestyle:   ['#LifestyleBrand', '#AfricanStyle', '#ModernAfrican', '#WestAfricanFashion'],
  educational: ['#TipsAndTricks', '#HowTo', '#DidYouKnow', '#LearnSomethingNew'],
  promotional: ['#SpecialOffer', '#LimitedTime', '#ExclusiveDeal', '#MembersOnly'],
  seasonal:    ['#HolidaySeason', '#SeasonalStyle', '#TrendingNow'],
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
        description: `2-3 timely hashtags relevant to the post. Use the current year (${new Date().getFullYear()}) for any year-specific tags.`,
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

function buildSystemPrompt(brandConfig) {
  const name = brandConfig?.identity?.name || 'this brand';
  const industry = brandConfig?.identity?.industry || 'their industry';
  const market = brandConfig?.identity?.market || 'their target market';
  const audience = brandConfig?.audience?.primary || '';
  const tone = brandConfig?.voice?.tone || '';

  return `You are the hashtag strategist for ${name} — a ${industry} brand serving ${market}.
${audience ? `Target audience: ${audience}` : ''}
${tone ? `Brand tone: ${tone}` : ''}

Current year: ${new Date().getFullYear()}

Your goal: maximise reach and engagement that is relevant to THIS brand specifically.

Rules:
- Only suggest hashtags that are relevant to ${name}'s industry and audience
- Never use generic mass-market tags (#sale, #cheap, #deal)
- Mix: 3-5 high-impact + 5-8 niche community + 2-3 timely/trending
- Avoid overused tags with >50M posts (they offer no visibility)
- For Instagram, aim for 10-15 total hashtags
- Any year-specific trending tags must use ${new Date().getFullYear()}, not prior years
- Do NOT include hashtags from unrelated industries or brands`;
}

/**
 * Generates an optimal hashtag set for a given piece of content.
 * @param {string} postContent
 * @param {string} platform
 * @param {string} contentType
 * @param {string[]} previouslyUsed
 * @param {string} [tenantId] - used to load brand config for tenant-specific hashtags
 */
async function generateHashtags(postContent, platform, contentType, previouslyUsed = [], tenantId = null) {
  const brandConfig = tenantId ? await getBrandConfig(tenantId).catch(() => null) : null;
  const systemPrompt = buildSystemPrompt(brandConfig);

  const brandName = brandConfig?.identity?.name;
  const brandHashtag = brandName
    ? `#${brandName.replace(/\s+/g, '')}`
    : null;

  const nichePool = NICHE_HASHTAGS[contentType] || NICHE_HASHTAGS.lifestyle;
  const rotationNote = previouslyUsed.length
    ? `\nAvoid reusing these recently used hashtags (rotation): ${previouslyUsed.slice(0, 20).join(', ')}`
    : '';

  const prompt = [
    `POST CONTENT:\n"${postContent.substring(0, 500)}"`,
    `Platform: ${platform}`,
    `Content type: ${contentType}`,
    brandHashtag ? `Always include the brand hashtag: ${brandHashtag}` : '',
    `Niche hashtag pool to draw from: ${nichePool.join(', ')}`,
    rotationNote,
  ].filter(Boolean).join('\n');

  const response = await createMessage({
    model: MODELS.FAST,
    maxTokens: 600,
    system: [cachedSystemBlock(systemPrompt)],
    messages: [{ role: 'user', content: prompt }],
    tools: [HASHTAG_TOOL],
    label: `Hashtag Manager (${platform})`,
  });

  const output = extractToolInput(response);
  if (!output) {
    return [brandHashtag, ...nichePool.slice(0, 4)].filter(Boolean);
  }

  return [
    ...output.primary,
    ...output.secondary,
    ...(output.trending || []),
  ].filter((h) => !output.avoidList?.includes(h));
}

/**
 * Retrieves recently used hashtags for a specific tenant + platform.
 */
async function getRecentHashtags(platform, days = 14, tenantId = null) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let q = (db) => {
    let query = db
      .from('content_schedule')
      .select('hashtags')
      .eq('platform', platform)
      .gte('scheduled_at', since)
      .limit(30);
    if (tenantId) query = query.eq('tenant_id', tenantId);
    return query;
  };
  const result = await supabaseQuery(q);
  if (!result) return [];
  return result.flatMap((r) => r.hashtags || []);
}

module.exports = { generateHashtags, getRecentHashtags };
