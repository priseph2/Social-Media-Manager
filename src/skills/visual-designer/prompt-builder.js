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

// Words that add no visual meaning — stripped before deriving scene keywords.
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','are','was','were','be','been','being','have','has','had','do','does',
  'did','will','would','could','should','may','might','shall','can','need',
  'here','there','this','that','these','those','it','its','your','our','their',
  'we','you','they','he','she','most','more','very','just','even','also',
  'so','if','when','how','what','why','who','all','any','each','every',
  'up','down','out','off','over','under','about','than','then','now',
  's','t','don','doesn','isn','aren','won','wasn','weren',
]);

/**
 * Extracts up to `max` meaningful visual keywords from a caption.
 * Strips hashtags, handles (@mentions), punctuation, and stop words so the
 * AI uses the theme as visual direction rather than trying to typeset the text.
 */
function extractVisualKeywords(text, max = 12) {
  return text
    .replace(/https?:\/\/\S+/g, '')       // URLs
    .replace(/[#@]\w+/g, '')              // hashtags & mentions
    .replace(/[^\w\s'-]/g, ' ')           // punctuation (keep hyphens/apostrophes)
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, '')) // trim leading/trailing apostrophes
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, max)
    .join(', ');
}

/**
 * Builds a detailed image generation prompt from caption text and brand config.
 * The caption is used only as thematic/visual context — never rendered as text
 * inside the image (AI text rendering is unreliable and produces garbled output).
 *
 * @param {string} captionText  - The approved social caption
 * @param {string} platform     - Target social platform
 * @param {object} brandConfig  - Nested brand config from brand_configs table
 * @returns {string}
 */
function buildImagePrompt(captionText, platform, brandConfig = {}) {
  const companyName    = brandConfig.identity?.name        || '';
  const website        = brandConfig.identity?.website     || '';
  const brandVoice     = brandConfig.voice?.tone           || '';
  const targetAudience = brandConfig.audience?.primary     || '';
  const visualStyle    = brandConfig.visual?.style         || '';
  const colorPalette   = brandConfig.visual?.colorPalette  || [];

  const guidance  = PLATFORM_GUIDANCE[platform] || PLATFORM_GUIDANCE.default;
  const colors    = colorPalette.length ? `Brand color palette: ${colorPalette.join(', ')}.` : '';
  const audience  = targetAudience ? `Target audience: ${targetAudience}.` : '';
  const style     = visualStyle    ? `Visual style: ${visualStyle}.`    : '';
  const voice     = brandVoice     ? `Brand personality: ${brandVoice}.` : '';
  const domain    = website ? `Brand website: ${website.replace(/^https?:\/\//, '').replace(/\/$/, '')}.` : '';

  // Convert caption to visual keywords so the AI treats it as thematic context,
  // not as typography to render inside the image.
  const visualTheme = extractVisualKeywords(captionText);
  const theme = visualTheme ? `Visual theme: ${visualTheme}.` : '';

  return [
    `Create a high-quality social media photograph or illustration for ${companyName || 'a brand'}.`,
    theme,
    guidance,
    colors,
    audience,
    style,
    voice,
    domain,
    // Explicit no-text instruction prevents AI from hallucinating garbled words in the scene.
    'IMPORTANT: Do NOT include any text, words, letters, numbers, logos, or typography anywhere in the image. Pure visual scene only.',
    'Photorealistic or polished illustration. Leave bottom-quarter of frame clear for text overlay. No watermarks. No borders.',
  ].filter(Boolean).join(' ');
}

module.exports = { buildImagePrompt };
