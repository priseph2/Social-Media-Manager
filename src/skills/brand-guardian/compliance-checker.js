'use strict';

/**
 * Regulatory compliance checks for Cascades Luxury content.
 * Covers FTC, Nigerian consumer protection basics, and luxury brand standards.
 */
class ComplianceChecker {
  static check(content) {
    const flags = [];

    // Medical / therapeutic claims for fragrances
    const medicalTerms = /\b(cures?|heals?|treats?|therapeutic|medicinal|anti-anxiety|antidepressant|hormones?)\b/i;
    if (medicalTerms.test(content)) {
      flags.push({ severity: 'high', rule: 'No medical claims for fragrances allowed' });
    }

    // Superlative claims that need substantiation
    const unsubstantiatedClaims = /\b(best in|number one|#1|most popular in africa|guaranteed to)\b/i;
    if (unsubstantiatedClaims.test(content)) {
      flags.push({ severity: 'medium', rule: 'Superlative claim requires substantiation or should be reworded' });
    }

    // Age-restricted marketing check
    const youthTargeting = /\b(kids|children|teen|teenager|student discount|school)\b/i;
    if (youthTargeting.test(content)) {
      flags.push({ severity: 'medium', rule: 'Content appears to target under-18 audience — review required' });
    }

    // Counterfeit / authenticity red flag (if someone edited to add "replica")
    const authenticityRisk = /\b(replica|fake|inspired by|dupe|knock-?off)\b/i;
    if (authenticityRisk.test(content)) {
      flags.push({ severity: 'critical', rule: 'Content references non-authentic products — must not be published' });
    }

    const hasHighSeverity = flags.some((f) => f.severity === 'critical' || f.severity === 'high');

    return {
      compliant: flags.length === 0,
      requiresHumanReview: hasHighSeverity,
      flags,
    };
  }
}

module.exports = ComplianceChecker;
