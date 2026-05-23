'use strict';

const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { MODELS } = require('../../config/constants');

const SUPPORTED_LANGUAGES = {
  fr: 'French',
  sw: 'Swahili',
  yo: 'Yoruba',
  ar: 'Arabic',
};

const SYSTEM_PROMPT = `You are an expert multilingual brand content specialist. Your task is to localise brand content so that the original voice, aspiration, and cultural resonance survive in every target language — not just the words.

Language expertise:

FRENCH
- Adapt register (formal "vous" vs. informal "tu") based on brand personality: luxury brands use formal, youth/lifestyle brands can go informal
- Preserve sentence rhythm; French favours longer, more elegant constructions than English
- Keep brand names and product names in their original form unless the brand has an official French adaptation

SWAHILI
- Swahili blends Bantu grammatical structure with modern loanwords; embrace both rather than forcing artificial purism
- East African social media norms: warm, communal tone; strong use of inclusive language ("sisi" framing)
- Digital and lifestyle vocabulary can use the widely understood English loanwords (e.g. "selfie", "hashtag") when no natural Swahili equivalent exists
- Avoid code-switching mid-sentence; produce clean Swahili throughout

YORUBA
- Tonal language — use standard written Yoruba with diacritical marks where they change meaning; flag in culturalNotes where tonal ambiguity could affect interpretation
- West African Gen Z social media style: energetic, aspirational, community-proud
- Proverbs and cultural references carry enormous weight — where an English phrase maps to a Yoruba idiom, prefer the idiom
- Brand names stay in Latin script

ARABIC
- Always right-to-left; set rtl: true in output
- Consider MSA (Modern Standard Arabic) vs. a dominant dialect: for broad reach default to MSA, but note in culturalNotes if a specific dialect (Egyptian, Levantine, Gulf) would better serve the target market
- Brand names: if the brand has an official Arabic transliteration, use it; otherwise keep Latin script with a note
- Avoid literal translation of idioms that have no Arabic equivalent — find the culturally resonant equivalent instead

UNIVERSAL RULES
- Brand voice must survive translation: if the brand is witty in English it must be witty in the target language, not just correct
- Hashtags should be localised: translate or transliterate so they are discoverable in the target market; keep English hashtags only when they are globally used in that community
- Character counts matter, especially for social captions — keep within platform constraints where a platform is specified
- Never sacrifice cultural authenticity for literal accuracy`;

const LOCALISE_TOOL = {
  name: 'submit_localised_content',
  description: 'Submit localised versions of the brand content in all requested languages',
  input_schema: {
    type: 'object',
    properties: {
      localisations: {
        type: 'array',
        description: 'One entry per requested target language',
        items: {
          type: 'object',
          properties: {
            language: {
              type: 'string',
              description: 'ISO 639-1 language code, e.g. "fr"',
            },
            languageName: {
              type: 'string',
              description: 'Human-readable language name, e.g. "French"',
            },
            text: {
              type: 'string',
              description: 'The translated/localised content in the native script of the target language',
            },
            rtl: {
              type: 'boolean',
              description: 'True when the target language is written right-to-left (Arabic)',
            },
            hashtags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Localised hashtags appropriate for the target market and platform',
            },
            culturalNotes: {
              type: 'string',
              description: 'Brief notes on cultural adaptations made, references changed for local resonance, or tonal marks that affect meaning',
            },
            characterCount: {
              type: 'number',
              description: 'Character count of the localised text (excluding hashtags)',
            },
          },
          required: ['language', 'languageName', 'text', 'rtl', 'hashtags', 'culturalNotes', 'characterCount'],
        },
      },
      originalLanguage: {
        type: 'string',
        description: 'Detected source language of the original content, e.g. "English"',
      },
      translationQualityNotes: {
        type: 'string',
        description: 'Notes on tricky terms, untranslatable phrases, or brand-specific words intentionally kept in the original language',
      },
    },
    required: ['localisations', 'originalLanguage', 'translationQualityNotes'],
  },
};

/**
 * Localises brand content into one or more target languages using Claude.
 *
 * @param {string}   content          - The source text to localise
 * @param {string[]} targetLanguages  - Array of ISO 639-1 codes, e.g. ['fr', 'sw', 'yo', 'ar']
 * @param {object}   brandConfig      - Brand identity config (identity, voice, messaging)
 * @param {string}   contentType      - 'social_caption' | 'email_campaign' | 'customer_response' | etc.
 * @param {string}   [platform]       - Optional platform name for length constraints (e.g. 'instagram')
 * @returns {Promise<object>}
 */
async function localiseContent(content, targetLanguages, brandConfig, contentType, platform) {
  const validCodes = targetLanguages.filter((code) => SUPPORTED_LANGUAGES[code]);
  if (validCodes.length === 0) {
    throw new Error(`No supported language codes found. Supported: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`);
  }

  const brandName = brandConfig?.identity?.name || 'the brand';
  const brandVoice = brandConfig?.voice?.tone || '';
  const brandPersonality = brandConfig?.voice?.personality?.join(', ') || '';
  const brandDos = brandConfig?.voice?.doList?.map((d) => `• ${d}`).join('\n') || '';
  const brandDonts = brandConfig?.voice?.dontList?.map((d) => `• ${d}`).join('\n') || '';
  const markets = brandConfig?.identity?.markets?.join(', ') || '';

  const languageList = validCodes
    .map((code) => `- ${SUPPORTED_LANGUAGES[code]} (${code})`)
    .join('\n');

  const platformNote = platform
    ? `\nPlatform: ${platform} — respect character limits appropriate to this platform in all localisations.`
    : '';

  const brandContext = [
    `Brand: ${brandName}`,
    brandVoice ? `Brand tone: ${brandVoice}` : '',
    brandPersonality ? `Brand personality: ${brandPersonality}` : '',
    markets ? `Target markets: ${markets}` : '',
    brandDos ? `Brand voice DOs:\n${brandDos}` : '',
    brandDonts ? `Brand voice DO NOTs:\n${brandDonts}` : '',
  ].filter(Boolean).join('\n');

  const userPrompt = [
    `Localise the following ${contentType.replace(/_/g, ' ')} content for ${brandName} into these languages:`,
    languageList,
    platformNote,
    '',
    'ORIGINAL CONTENT:',
    '"""',
    content,
    '"""',
    '',
    'BRAND CONTEXT:',
    brandContext,
    '',
    'Instructions:',
    '• Preserve the brand voice and emotional tone — not just the meaning',
    '• For each language, provide culturally resonant hashtags (localised, not direct translations of English hashtags)',
    '• Note any creative or cultural decisions made in culturalNotes',
    '• Detect and report the original language in your response',
    '• Flag any terms that are intentionally kept in the original language in translationQualityNotes',
  ].filter(Boolean).join('\n');

  const response = await createMessage({
    model: MODELS.PRIMARY,
    maxTokens: 3000,
    system: [cachedSystemBlock(SYSTEM_PROMPT)],
    messages: [{ role: 'user', content: userPrompt }],
    tools: [LOCALISE_TOOL],
    label: `Localiser: ${validCodes.join(', ')} (${contentType})`,
  });

  const output = extractToolInput(response);
  if (!output) throw new Error('Localiser did not return structured output');

  return {
    original: content,
    localisations: output.localisations,
    originalLanguage: output.originalLanguage,
    translationQualityNotes: output.translationQualityNotes,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { localiseContent };
