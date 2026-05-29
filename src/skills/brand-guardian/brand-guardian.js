'use strict';

const BaseSkill = require('../base-skill');
const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const BrandValidator = require('./brand-validator');
const ComplianceChecker = require('./compliance-checker');
const { eventBus, EVENTS } = require('../../services/messaging/event-emitter');
const { enqueue } = require('../../orchestrator/message-queue');
const { SKILLS, QUEUES, PRIORITY, MODELS, BRAND } = require('../../config/constants');
const { getBrandConfig } = require('../../services/brand-config');
const Content = require('../../models/content.model');
const { isMongoAvailable } = require('../../services/database/mongodb-client');
const { supabaseQuery } = require('../../services/database/supabase-client');
const { notify } = require('../../services/notifications');

function buildSystemPrompt(brandConfig) {
  const name = brandConfig?.identity?.name || 'the brand';
  return `You are the Brand Guardian for ${name}, the final quality gate before any content is published.

Your authority: You can APPROVE or REJECT any content. Your decision is final unless overridden by a human manager.

Your role is to ensure every piece of content:
1. Perfectly represents the ${name} brand voice and positioning
2. Resonates authentically with the brand's target audience
3. Maintains the required tone and quality standard
4. Is factually accurate and legally compliant
5. Creates genuine desire and emotional connection

When reviewing content you will:
- Assess brand voice consistency (0-100 score)
- Check for off-brand language, tone or messaging
- Identify specific improvements if content needs revision
- Consider the platform/context it's being used for
- Give actionable feedback, not vague criticism

Be discerning but not overly restrictive. Reject only when content would genuinely harm the brand or violate compliance rules.
Approve with minor suggestions when content is strong but could be polished.

IMPORTANT — requiresHumanApproval: Set this to true ONLY for genuinely borderline cases:
- Content that could cause legal or reputational damage but you are unsure whether to reject
- Content referencing real people, competitors, or sensitive current events
- Content with factual claims you cannot verify
Do NOT set requiresHumanApproval for: minor tone suggestions, hashtag recommendations, general style polish, or routine compliance reminders like #ad that don't apply to this content. Approved and approved_with_suggestions content with minor notes should have requiresHumanApproval: false.`;
}

const REVIEW_TOOL = {
  name: 'submit_brand_review',
  description: 'Submit the brand review decision for a piece of content',
  input_schema: {
    type: 'object',
    properties: {
      decision: {
        type: 'string',
        enum: ['approved', 'approved_with_suggestions', 'needs_revision', 'rejected'],
      },
      qualityScore: { type: 'number', description: 'Brand voice quality score 0-100' },
      summary: { type: 'string', description: 'One-sentence review summary' },
      strengths: { type: 'array', items: { type: 'string' } },
      issues: { type: 'array', items: { type: 'string' } },
      revisedContent: { type: 'string', description: 'Improved version (only when needs_revision)' },
      requiresHumanApproval: { type: 'boolean', description: 'true ONLY for genuinely risky/borderline content (legal risk, unverifiable claims, sensitive topics). false for approved/approved_with_suggestions with only minor style or hashtag notes.' },
    },
    required: ['decision', 'qualityScore', 'summary', 'strengths', 'issues', 'requiresHumanApproval'],
  },
};

class BrandGuardian extends BaseSkill {
  constructor() {
    super(SKILLS.BRAND_GUARDIAN);
  }

  async execute(job) {
    const { content, type, platform, context, tenantId } = job.data;

    this.log.info(`Reviewing ${type} content for ${platform || 'unspecified platform'}`, { jobId: job.id });

    const brandConfig = await getBrandConfig(tenantId);
    const guidelinesText = JSON.stringify(brandConfig, null, 2);
    const systemPrompt = buildSystemPrompt(brandConfig);

    // ── Fast static checks ─────────────────────────────────────────────────
    const quickResult = BrandValidator.quickCheck(content);
    const complianceResult = ComplianceChecker.check(content);

    if (complianceResult.flags.some((f) => f.severity === 'critical')) {
      this.log.error('Critical compliance violation — auto-rejecting', { flags: complianceResult.flags });
      const result = this._buildResult({
        decision: 'rejected',
        qualityScore: 0,
        summary: 'Auto-rejected: critical compliance violation',
        strengths: [],
        issues: complianceResult.flags.map((f) => f.rule),
        requiresHumanApproval: true,
        staticViolations: quickResult.violations,
        complianceFlags: complianceResult.flags,
      }, job);
      await this._updateContentDocument(job.data.originalJobId, result);
      await this._dispatchResult(job, result);
      return result;
    }

    if (platform) {
      const limitCheck = BrandValidator.checkPlatformLimits(content, platform);
      if (!limitCheck.passed) {
        const result = this._buildResult({
          decision: 'needs_revision',
          qualityScore: 60,
          summary: `Content exceeds ${platform} character limit`,
          strengths: [],
          issues: limitCheck.violations,
          requiresHumanApproval: false,
        }, job);
        await this._updateContentDocument(job.data.originalJobId, result);
        await this._dispatchResult(job, result);
        return result;
      }
    }

    // ── Claude deep review ─────────────────────────────────────────────────
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
      model: MODELS.FAST,
      maxTokens: 1024,
      system: [
        cachedSystemBlock(systemPrompt),
        cachedSystemBlock(`BRAND GUIDELINES:\n${guidelinesText}`),
      ],
      messages: [{ role: 'user', content: reviewRequest }],
      tools: [REVIEW_TOOL],
      label: `Brand Guardian review (${type})`,
    });

    const reviewData = extractToolInput(response);
    if (!reviewData) throw new Error('Brand Guardian did not return a structured review');

    const result = this._buildResult({ ...reviewData, staticViolations: quickResult.violations, complianceFlags: complianceResult.flags }, job);
    await this._updateContentDocument(job.data.originalJobId, result);
    await this._dispatchResult(job, result);
    return result;
  }

  async _updateContentDocument(originalJobId, review) {
    if (!isMongoAvailable() || !originalJobId) return;
    // Map approved_with_suggestions → approved (Content schema enum only has 4 values)
    const statusMap = { approved: 'approved', approved_with_suggestions: 'approved', needs_revision: 'needs_revision', rejected: 'rejected' };
    const status = statusMap[review.decision] || 'needs_revision';
    try {
      await Content.findOneAndUpdate(
        { jobId: String(originalJobId) },
        { $set: { 'brandReview.status': status, 'brandReview.qualityScore': review.qualityScore, 'brandReview.feedback': review.summary, 'brandReview.reviewedAt': new Date() } }
      );
    } catch (err) {
      this.log.warn('Failed to update content brand review in MongoDB', { error: err });
    }
  }

  _buildResult(reviewData, job) {
    const { decision, qualityScore, requiresHumanApproval } = reviewData;
    const isApproved = decision === 'approved' || decision === 'approved_with_suggestions';

    this.log.info(`Brand review: ${decision} (score: ${qualityScore})`, {
      jobId: job.id, decision, qualityScore, requiresHumanApproval,
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

  async _dispatchResult(job, result) {
    const { decision, qualityScore, requiresHumanApproval, approved } = result;

    // Escalate if score is very low or AI flagged it
    if (requiresHumanApproval || qualityScore < BRAND.HIGH_RISK_THRESHOLD) {
      eventBus.publish(EVENTS.ESCALATION_REQUIRED, {
        type: 'brand_review_escalation',
        tenantId: job.data.tenantId,
        jobId: job.id,
        content: job.data.content?.substring(0, 200),
        reason: result.summary,
      });
    }

    if (!approved) return;

    // If AI flagged for human review, always queue for approval regardless of tenant gate
    if (requiresHumanApproval) {
      await this._saveForHumanApproval(job, result);
      return;
    }

    // Check if this tenant requires a human approval gate before publishing
    const needsGate = await this._tenantRequiresApprovalGate(job.data.tenantId);

    if (needsGate) {
      await this._saveForHumanApproval(job, result);
    } else {
      eventBus.publish(EVENTS.CONTENT_APPROVED, {
        jobId: job.id, tenantId: job.data.tenantId, ...job.data, review: result,
      });
    }
  }

  async _tenantRequiresApprovalGate(tenantId) {
    if (!tenantId) return false;
    try {
      const row = await supabaseQuery((db) =>
        db.from('tenants').select('settings').eq('id', tenantId).single()
      );
      return row?.settings?.require_content_approval === true;
    } catch {
      return false;
    }
  }

  async _saveForHumanApproval(job, result) {
    const { tenantId, content, platform, type } = job.data;
    try {
      await supabaseQuery((db) =>
        db.from('content_approvals').insert({
          tenant_id: tenantId,
          job_data: job.data,
          content_preview: (typeof content === 'string' ? content : content?.selectedContent || JSON.stringify(content))?.substring(0, 500),
          platform: platform || null,
          content_type: type || null,
          brand_score: result.qualityScore,
          review_summary: result.summary,
        })
      );
      eventBus.publish(EVENTS.CONTENT_PENDING_APPROVAL, {
        tenantId, jobId: job.id, platform, contentType: type, brandScore: result.qualityScore,
      });
      await notify(tenantId, {
        type: 'approval_pending',
        title: 'Content needs your review',
        body: `A ${type || 'content'} item for ${platform || 'your platform'} scored ${result.qualityScore}/100 and requires manual approval before publishing.`,
        link: '/dashboard/content/approvals',
      });
      this.log.info('Content queued for human approval', { jobId: job.id, tenantId, platform });
    } catch (err) {
      this.log.error('Failed to save content for approval — falling back to auto-publish', { error: err });
      // Safety fallback: publish anyway so content isn't silently lost
      eventBus.publish(EVENTS.CONTENT_APPROVED, {
        jobId: job.id, tenantId, ...job.data, review: result,
      });
    }
  }

  async reviewSync(contentData) {
    const fakeJob = { id: `sync-${Date.now()}`, name: 'review-content', data: contentData };
    return this.execute(fakeJob);
  }
}

module.exports = BrandGuardian;
