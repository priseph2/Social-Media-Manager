'use strict';

const BRAND_GUIDELINES = require('../../config/brand-guidelines');

/**
 * Static rule-based pre-checks run before sending content to Claude.
 * Fast and free — catches obvious violations without spending API tokens.
 */
class BrandValidator {
  /**
   * Returns { passed: bool, violations: string[] }
   */
  static quickCheck(text) {
    const violations = [];
    const t = text.toLowerCase();

    // Hard no-nos from brand guidelines
    const bannedPhrases = [
      'world-class', 'take your experience to the next level', 'affordable luxury',
      'budget-friendly', 'cheap', 'discount', 'sale sale sale', 'buy now!!!',
    ];
    bannedPhrases.forEach((phrase) => {
      if (t.includes(phrase)) violations.push(`Contains banned phrase: "${phrase}"`);
    });

    // All-caps words (brand voice violation)
    const allCapsWords = text.match(/\b[A-Z]{4,}\b/g) || [];
    allCapsWords.forEach((w) => violations.push(`All-caps word not allowed: "${w}"`));

    // Excessive exclamation marks
    const exclamationCount = (text.match(/!/g) || []).length;
    if (exclamationCount > 2) violations.push(`Too many exclamation marks (${exclamationCount}). Max 1 per piece.`);

    // FTC compliance — if it mentions collab/gifted but no disclosure
    const hasCollab = /gifted|collab|partnership|sponsored|paid/i.test(text);
    const hasDisclosure = /#ad\b|#sponsored\b|paid partnership/i.test(text);
    if (hasCollab && !hasDisclosure) violations.push('Potential paid partnership without disclosure (#ad or #sponsored required)');

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  /**
   * Platform-specific character limit checks.
   */
  static checkPlatformLimits(text, platform) {
    const limits = {
      twitter: 280,
      instagram: 2200,
      facebook: 63206,
      tiktok: 2200,
      pinterest: 500,
    };
    const limit = limits[platform];
    if (!limit) return { passed: true };
    if (text.length > limit) {
      return {
        passed: false,
        violations: [`Text length (${text.length}) exceeds ${platform} limit (${limit})`],
      };
    }
    return { passed: true, violations: [] };
  }
}

module.exports = BrandValidator;
