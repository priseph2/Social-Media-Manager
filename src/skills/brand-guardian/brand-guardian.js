'use strict';

const BaseSkill = require('../base-skill');
const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const BrandValidator = require('./brand-validator');
const ComplianceChecker = require('./compliance-checker');
const { eventBus, EVENTS } = require('../../services/messaging/event-emitter');
const { enqueue } = require('../../orchestrator/message-queue');
const { SKILLS, QUEUES, PRIORITY, MODELS, BRAND } = require('../../config/constants');
const BRAND_GUIDELINES = require('../../config/brand-guidelines');

const SYSTEM_PROMPT = `You are the Brand Guardian for Cascades Luxury, the final quality gate before any content is published.

Your authority: You can APPROVE or REJECT any content. Your decision is final unless overridden by a human manager.

Your role is to ensure every piece of content:
1. Perfectly represents the Cascades Luxury brand voice and positioning
2. Resonates with affluent West African luxury consumers
3. Maintains the premium, sophisticated tone the brand requires
4. Is factually accurate and legally compliant
5. Creates genuine desire and emotional connection

When reviewing content you will:
- Assess brand voice consistency (0-100 score)
- Check for off-brand language, tone or messaging
- Identify specific improvements if content needs revision
- Consider the platform/context it's being used for
- Give actionable feedback, not vague criticism

Be discerning but not overly restrictive. Luxury brands are bold and distinctive.
Reject only when content would genuinely harm the brand or violate compliance rules.
Approve with minor suggestions when content is strong but could be polished.`;

// Tool definition for structured output
const REVIEW_TOOL = {
  name: 'submit_brand_review',
  description: 'Submit the brand review decision for a piece of content',
  input_schema: {
    type: 'object',
    properties: {
      decision: {
        type: 'string',
        enum: ['approved', 'approved_with_suggestions', 'needs_revision', 'rejected'],
        description: 'The review decision',
      },
      qualityScore: {
        type: 'number',
        description: 'Brand voice quality score from 0-100',
      },
      summary: {
        type: 'string',
        description: 'One-sentence summary of the review decision',
      },
      strengths: {
        type: 'array',
        items: { type: 'string' },
        description: 'What the content does well',
      },
      issues: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific issues found (empty if approved)',
      },
      revisedContent: {
        type: 'string',
        description: 'Improved version of the content (only when decision is needs_revision)',
      },
      requiresHumanApproval: {
        type: 'boolean',
        description: 'True if this content must be reviewed by a human before publishing',
      },
    },
    required: ['decision', 'qualityScore', 'summary', 'strengths', 'issues', 'requiresHumanApproval'],
  },
};

class BrandGuardian extends BaseSkill {
  constructor() {
    super(SKILLS.BRAND_GUARDIAN);
    // Pre-stringify guidelines once for use in cached system blocks
    this._guidelinesText = JSON.stringify(BRAND_GUIDELINES, null, 2);
  }

  async execute(job) {
    const { content, type, platform, context } = job.data;

    this.log.info(`Reviewing ${type} content for ${platform || 'unspecified platform'}`, { jobId: job.id });

    // ── Step 1: Fast static checks (free, milliseconds) ────────────────────
    const quickResult = BrandValidator.quickCheck(content);
    const complianceResult = ComplianceChecker.check(content);

    if (complianceResult.flags.some((f) => f.severity === 'critical')) {
      this.log.error('Critical compliance violation — auto-rejecting', { flags: complianceResult.flags });
      return this._buildResult({
        decision: 'rejected',
        qualityScore: 0,
        summary: 'Auto-rejected: critical compliance violation',
        strengths: [],
        issues: complianceResult.flags.map((f) => f.rule),
        requiresHumanApproval: true,
        staticViolations: quickResult.violations,
        complianceFlags: complianceResult.flags,
      }, job);
    }

    if (platform) {
      const limitCheck = BrandValidator.checkPlatformLimits(content, platform);
      if (!limitCheck.passed) {
        return this._buildResult({
          decision: 'needs_revision',
          qualityScore: 60,
          summary: `Content exceeds ${platform} character limit`,
          strengths: [],
          issues: limitCheck.violations,
          requiresHumanApproval: false,
        }, job);
      }
    }

    // ── Step 2: Claude deep review (cached system prompt) ──────────────────
    const reviewRequest = [
      `CONTENT TYPE: ${type}`,
      platform ? `PLATFORM: ${platform}` : '',
      context ? `CONTEXT: ${context}` : '',
      '',
      'CONTENT TO REVIEW:',
      '---',
      content,
      '---',
      quickResult.violations.length
        ? `\nPRE-CHECK FLAGS:\n${quickResult.violations.map((v) => `• ${v}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n');

    const response = await createMessage({
      model: MODELS.FAST, // Haiku is fast + cheap for reviews
      maxTokens: 1024,
      system: [
        cachedSystemBlock(SYSTEM_PROMPT),
        cachedSystemBlock(`BRAND GUIDELINES:\n${this._guidelinesText}`),
      ],
      messages: [{ role: 'user', content: reviewRequest }],
      tools: [REVIEW_TOOL],
      label: `Brand Guardian review (${type})`,
    });

    const reviewData = extractToolInput(response);
    if (!reviewData) throw new Error('Brand Guardian did not return a structured review');

    return this._buildResult({ ...reviewData, staticViolations: quickResult.violations, complianceFlags: complianceResult.flags }, job);
  }

  _buildResult(reviewData, job) {
    const { decision, qualityScore, requiresHumanApproval } = reviewData;

    const isApproved = decision === 'approved' || decision === 'approved_with_suggestions';
    const isHighScore = qualityScore >= BRAND.AUTO_APPROVE_THRESHOLD;

    // Emit events for the orchestrator to act on
    if (isApproved && !requiresHumanApproval) {
      eventBus.publish(EVENTS.CONTENT_APPROVED, { jobId: job.id, ...job.data, review: reviewData });
    }

    if (requiresHumanApproval || qualityScore < BRAND.HIGH_RISK_THRESHOLD) {
      eventBus.publish(EVENTS.ESCALATION_REQUIRED, {
        type: 'brand_review_escalation',
        jobId: job.id,
        content: job.data.content?.substring(0, 200),
        reason: reviewData.summary,
      });
    }

    this.log.info(`Brand review: ${decision} (score: ${qualityScore})`, {
      jobId: job.id,
      decision,
      qualityScore,
      requiresHumanApproval,
    });

    return {
      decision,
      qualityScore,
      approved: isApproved,
      requiresHumanApproval,
      summary: reviewData.summary,
      strengths: reviewData.strengths,
      issues: reviewData.issues,
      revisedContent: reviewData.revisedContent,
      staticViolations: reviewData.staticViolations || [],
      complianceFlags: reviewData.complianceFlags || [],
    };
  }

  /**
   * Convenience method for synchronous review calls from other skills.
   * Returns the review result directly (bypasses queue).
   */
  async reviewSync(contentData) {
    const fakeJob = { id: `sync-${Date.now()}`, name: 'review-content', data: contentData };
    return this.execute(fakeJob);
  }
}

module.exports = BrandGuardian;
