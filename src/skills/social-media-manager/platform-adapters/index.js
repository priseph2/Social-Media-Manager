'use strict';

/**
 * Platform-specific formatting rules and adapters.
 * Each adapter takes raw content and formats it for its platform.
 */
const PLATFORM_CONFIGS = {
  instagram: {
    maxChars: 2200,
    hashtagPosition: 'end',     // hashtags at the end of caption
    maxHashtags: 30,
    idealHashtags: { min: 8, max: 15 },
    lineBreaks: true,
    emojiAllowed: true,
    tone: 'visual-first, aspirational, sensory',
    ctaStyle: 'DM us / Link in bio',
  },
  facebook: {
    maxChars: 63206,
    hashtagPosition: 'inline',
    maxHashtags: 5,
    idealHashtags: { min: 2, max: 5 },
    lineBreaks: true,
    emojiAllowed: true,
    tone: 'storytelling, community, slightly longer form',
    ctaStyle: 'Comment below / Share with a friend',
  },
  twitter: {
    maxChars: 280,
    hashtagPosition: 'inline',
    maxHashtags: 2,
    idealHashtags: { min: 1, max: 2 },
    lineBreaks: false,
    emojiAllowed: true,
    tone: 'punchy, direct, conversational',
    ctaStyle: 'Reply / Retweet',
  },
  tiktok: {
    maxChars: 2200,
    hashtagPosition: 'end',
    maxHashtags: 10,
    idealHashtags: { min: 4, max: 8 },
    lineBreaks: false,
    emojiAllowed: true,
    tone: 'casual, energetic, trending hooks, Gen Z-friendly but not slang',
    ctaStyle: 'Comment / Follow for more',
  },
  pinterest: {
    maxChars: 500,
    hashtagPosition: 'end',
    maxHashtags: 5,
    idealHashtags: { min: 2, max: 5 },
    lineBreaks: true,
    emojiAllowed: false,
    tone: 'descriptive, aspirational, lifestyle-focused',
    ctaStyle: 'Save this pin',
  },
};

/**
 * Adapts content for a specific platform's rules.
 * Truncates if needed and formats hashtags correctly.
 */
function adaptForPlatform(text, hashtags = [], platform) {
  const config = PLATFORM_CONFIGS[platform];
  if (!config) throw new Error(`Unknown platform: ${platform}`);

  // Select the right number of hashtags
  const selectedHashtags = hashtags.slice(0, config.maxHashtags);
  const hashtagStr = selectedHashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');

  let adapted;
  if (config.hashtagPosition === 'end') {
    adapted = `${text.trim()}\n\n${hashtagStr}`.trim();
  } else {
    adapted = `${text.trim()} ${hashtagStr}`.trim();
  }

  // Truncate to platform limit
  if (adapted.length > config.maxChars) {
    const truncated = adapted.substring(0, config.maxChars - 4) + '...';
    return { text: truncated, truncated: true, platform, config };
  }

  return { text: adapted, truncated: false, platform, config };
}

/**
 * Returns the config for a platform (for use in prompts).
 */
function getPlatformConfig(platform) {
  return PLATFORM_CONFIGS[platform] || null;
}

module.exports = { adaptForPlatform, getPlatformConfig, PLATFORM_CONFIGS };
