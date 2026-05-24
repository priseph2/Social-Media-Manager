'use strict';

const PLATFORM_GUIDANCE = {
  instagram:       'Square or portrait format. Vibrant, eye-catching lifestyle photography aesthetic. Clean composition.',
  instagram_story: 'Vertical portrait format. Bold, immersive, thumb-stopping. Full-bleed background.',
  instagram_reel:  'Vertical portrait format. Dynamic, energetic thumbnail. High contrast.',
  facebook:        'Landscape format. Professional yet approachable. Clear subject with minimal text.',
  twitter:         'Landscape format. Clean and direct. High contrast for small screen readability.',
  linkedin:        'Professional landscape format. Clean corporate aesthetic. Authoritative.',
  tiktok:          'Vertical portrait format. Gen-Z energy. Bold colors, dynamic composition.',
  pinterest:       'Tall portrait format. Inspirational, aspirational imagery. Soft styling.',
  default:         'Square format. Clean, professional composition.',
};

/**
 * Builds a detailed image generation prompt from caption text and brand config.
 *
 * @param {string} captionText  - The approved social caption (used for visual context)
 * @param {string} platform     - Target social platform
 * @param {object} brandConfig  - Tenant brand configuration from brand_configs table
 * @returns {string}
 */
function buildImagePrompt(captionText, platform, brandConfig = {}) {
  const {
    companyName = '',
    industry = '',
    brandVoice = '',
    visualStyle = '',
    colorPalette = [],
    targetAudience = '',
  } = brandConfig;

  const guidance = PLATFORM_GUIDANCE[platform] || PLATFORM_GUIDANCE.default;
  const colors = colorPalette.length
    ? `Brand color palette: ${colorPalette.join(', ')}.`
    : '';
  const audience = targetAudience
    ? `Target audience: ${targetAudience}.`
    : '';
  const industry_ = industry ? `Industry: ${industry}.` : '';
  const style = visualStyle
    ? `Visual style: ${visualStyle}.`
    : '';
  const voice = brandVoice
    ? `Brand personality: ${brandVoice}.`
    : '';

  // Summarize the caption into a visual scene — avoid text-heavy generation
  const sceneBrief = captionText.length > 200
    ? captionText.slice(0, 200).replace(/[#@].*/g, '').trim()
    : captionText.replace(/[#@].*/g, '').trim();

  return [
    `Create a high-quality social media image for ${companyName || 'a brand'}.`,
    `Scene: ${sceneBrief}`,
    guidance,
    colors,
    audience,
    industry_,
    style,
    voice,
    'Photorealistic or polished illustration. No text overlays. No watermarks. No borders.',
  ].filter(Boolean).join(' ');
}

module.exports = { buildImagePrompt };
