'use strict';

/**
 * Master brand guidelines for Cascades Luxury.
 * These are loaded into the Brand Guardian's system prompt (with prompt caching)
 * and distributed to all other skills as reference.
 *
 * Update this file quarterly or when brand positioning evolves.
 * Version is tracked so cache invalidation happens automatically on change.
 */
const BRAND_GUIDELINES = {
  version: '1.0.0',
  updatedAt: '2026-05-23',

  identity: {
    name: 'Cascades Luxury',
    tagline: 'Where Luxury Meets Lifestyle',
    founded: 'Lagos & Accra',
    markets: ['Nigeria', 'Ghana', 'West Africa', 'African diaspora globally'],
    positioning: 'Premier curator of luxury fragrances and beauty products in West Africa. We bridge the gap between global luxury brands and discerning African consumers.',
  },

  audience: {
    primary: 'Affluent African professionals, aged 25–45, with high disposable income. Educated, globally-minded, brand-aware. Value quality, exclusivity, and authenticity.',
    secondary: 'Gifters — people buying luxury gifts for special occasions (birthdays, anniversaries, Valentine\'s, celebrations).',
    psychographics: [
      'Aspires to global luxury standards with local pride',
      'Quality over quantity — prefers one premium item over several budget ones',
      'Uses luxury brands as identity markers and social currency',
      'Researches extensively before buying; values expertise and curation',
      'Appreciates education and storytelling behind products',
    ],
  },

  voice: {
    personality: ['Sophisticated', 'Knowledgeable', 'Aspirational', 'Warm', 'Exclusive'],
    tone: 'Refined elegance with genuine warmth. We speak as a trusted luxury advisor, not a salesperson. Confident without arrogance. Inclusive without being mass-market.',
    doList: [
      'Use sensory language that evokes emotion (scent, texture, feeling)',
      'Speak directly to the reader — "you deserve", "your signature scent"',
      'Reference occasions and lifestyle moments, not just product features',
      'Educate subtly — share fragrance knowledge as an insider would',
      'Create desire through storytelling and aspiration',
      'Acknowledge the investment — luxury items have value worth celebrating',
      'Use specific, vivid language over generic adjectives',
    ],
    dontList: [
      'Never use slang, emojis in formal contexts, or overly casual language',
      'Never be aggressive or pushy — no "BUY NOW" or countdown pressure tactics',
      'Never compare to lower-market competitors or position as "affordable luxury"',
      'Never use all-caps for emphasis (use phrasing instead)',
      'Never make claims you cannot substantiate (best, number one, etc.)',
      'Never use clichés: "world-class", "take your experience to the next level"',
      'Avoid overusing exclamation marks — one per piece maximum',
    ],
  },

  messaging: {
    corePillars: [
      'Curation: We select only the finest — every product is chosen with expertise',
      'Authenticity: All products are 100% genuine, sourced directly or from authorised distributors',
      'Experience: Shopping with us is as luxurious as the products themselves',
      'Community: We celebrate African excellence and global luxury in equal measure',
    ],
    valuePropositions: [
      'Access to global luxury brands in Lagos and Accra',
      'Expert curation — you don\'t have to choose from thousands; we\'ve already vetted the best',
      'Authentic guarantee — every product is verified genuine',
      'Personalised recommendations from fragrance experts',
      'Gift-ready packaging and concierge service',
    ],
  },

  visual: {
    primaryColors: ['Deep gold (#C9A94B)', 'Midnight black (#0A0A0A)', 'Ivory white (#FAFAF5)'],
    accentColors: ['Champagne (#F7E7CE)', 'Deep burgundy (#5C0A14)'],
    typography: 'Serif for headlines (elegance), clean sans-serif for body (readability)',
    imagery: 'High-contrast product photography, lifestyle shots with aspirational settings. African settings and faces celebrated, not tokenised.',
    videoStyle: 'Slow, deliberate pacing. Sensory focus. Voice-over or elegant music. Never fast-cut or frenetic.',
  },

  contentMix: {
    educational: 0.25,    // fragrance notes, how to layer, occasion guides
    productShowcase: 0.25, // new arrivals, bestsellers, product stories
    lifestyle: 0.20,       // mood, occasion, aspiration content
    community: 0.15,       // customer stories, UGC, milestones
    promotional: 0.15,     // offers, campaigns, events
  },

  competitiveContext: {
    differentiation: 'We are not a marketplace or a distributor. We are curators. Our expertise, service, and brand environment are the product as much as the fragrances.',
    avoidComparisons: true,
    luxuryPositioning: 'Never discount positioning — offers should be framed as exclusive access, not sales.',
  },

  compliance: {
    ftcDisclosure: 'All paid partnerships must be disclosed with #ad or #sponsored',
    claims: 'No medical or therapeutic claims for fragrances',
    pricing: 'Prices in NGN primary, USD secondary where relevant',
    ageRestriction: 'No marketing explicitly targeting under 18',
  },
};

module.exports = BRAND_GUIDELINES;
