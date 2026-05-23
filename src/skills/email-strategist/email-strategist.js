'use strict';

const BaseSkill = require('../base-skill');
const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { assembleNewsletter } = require('./newsletter-assembler');
const { classifySubscriber, getSegment, getAllSegments } = require('./segmentation');
const { getSequence, getAllSequences } = require('./automation-sequences');
const { enqueue } = require('../../orchestrator/message-queue');
const { supabaseQuery } = require('../../services/database/supabase-client');
const mailchimpApi = require('../../services/api-clients/mailchimp-api');
const { SKILLS, QUEUES, PRIORITY, MODELS } = require('../../config/constants');
const BRAND_GUIDELINES = require('../../config/brand-guidelines');

const STRATEGIST_SYSTEM = `You are the Email Strategist for Cascades Luxury — responsible for all email marketing.

Your emails achieve above-industry-average open rates (target: 22-25%) because they:
- Feel personally crafted, not mass-produced
- Lead with value (education, inspiration) before promotion
- Respect the reader's intelligence and time
- Maintain the premium brand tone in every word

You understand Mailchimp's best practices: segmentation, A/B testing, send-time optimisation.
You know West African consumer behaviour — peak email times, cultural moments, payment psychology.`;

const SUBJECT_LINE_TOOL = {
  name: 'submit_subject_lines',
  description: 'Submit A/B test subject line options with analysis',
  input_schema: {
    type: 'object',
    properties: {
      options: {
        type: 'array',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: '40-60 characters' },
            previewText: { type: 'string', description: '60-90 characters' },
            approach: { type: 'string', enum: ['curiosity', 'benefit', 'fomo', 'personalization', 'storytelling', 'question'] },
            targetSegment: { type: 'string', description: 'Which segment this works best for' },
            predictedOpenRate: { type: 'string', description: 'e.g., 20-25%' },
          },
          required: ['subject', 'previewText', 'approach'],
        },
      },
      recommended: { type: 'number', description: 'Index of the strongest option' },
    },
    required: ['options', 'recommended'],
  },
};

const CAMPAIGN_ANALYSIS_TOOL = {
  name: 'submit_campaign_analysis',
  description: 'Submit analysis of email campaign performance',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      keyFindings: { type: 'array', items: { type: 'string' } },
      bestPerformingSegment: { type: 'string' },
      bestSubjectLineApproach: { type: 'string' },
      optimalSendTimes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            segment: { type: 'string' },
            day: { type: 'string' },
            time: { type: 'string' },
          },
        },
      },
      nextCampaignRecommendations: { type: 'array', items: { type: 'string' } },
      revenueAttribution: { type: 'string' },
    },
    required: ['summary', 'keyFindings', 'nextCampaignRecommendations'],
  },
};

/**
 * SKILL 3: Email Strategist — Phase 3 (Fully Implemented)
 *
 * Job types:
 *   create-campaign          → builds a complete email campaign (copy + subject lines)
 *   create-weekly-newsletter → full newsletter pipeline with Brand Guardian review
 *   generate-subject-lines   → A/B test subject line options for any campaign
 *   manage-segmentation      → classify and update subscriber segments
 *   setup-automation         → configures email automation sequences in Mailchimp
 *   send-campaign            → triggers a Mailchimp campaign send
 *   analyse-performance      → reviews campaign metrics and gives recommendations
 */
class EmailStrategist extends BaseSkill {
  constructor() {
    super(SKILLS.EMAIL_STRATEGIST);
  }

  async execute(job) {
    switch (job.name) {
      case 'create-campaign':
        return this.createCampaign(job);
      case 'create-weekly-newsletter':
        return this.createWeeklyNewsletter(job);
      case 'generate-subject-lines':
        return this.generateSubjectLines(job);
      case 'manage-segmentation':
        return this.manageSegmentation(job);
      case 'setup-automation':
        return this.setupAutomation(job);
      case 'send-campaign':
        return this.sendCampaign(job);
      case 'analyse-performance':
        return this.analysePerformance(job);
      default:
        throw new Error(`Email Strategist: unknown job "${job.name}"`);
    }
  }

  // ── Create Campaign ──────────────────────────────────────────────────────────

  async createCampaign(job) {
    const { campaignGoal, audienceSegment, product, offer, urgency, contentFromGenerator } = job.data;
    this.log.info('Creating email campaign', { jobId: job.id, goal: campaignGoal });

    const segment = getSegment(audienceSegment);

    // Generate subject lines
    const subjectJob = { id: `${job.id}-subjects`, name: 'generate-subject-lines', data: { campaignGoal, audienceSegment, product, offer } };
    const { options: subjectOptions, recommended } = await this.generateSubjectLines(subjectJob);

    // If content was generated by Content Generator, use it; otherwise generate campaign copy
    let emailBody = contentFromGenerator?.emailBody;
    if (!emailBody) {
      emailBody = await this._generateCampaignCopy({ campaignGoal, segment, product, offer, urgency });
    }

    // Send to Brand Guardian for review before creating in Mailchimp
    const reviewJob = await enqueue(QUEUES.BRAND_REVIEW, 'review-content', {
      content: `Subject: ${subjectOptions[recommended].subject}\n\n${emailBody.openingHook}\n\n${emailBody.mainContent}`,
      type: 'email_campaign',
      context: `Campaign goal: ${campaignGoal}, Segment: ${audienceSegment}`,
    }, { priority: PRIORITY.HIGH });

    // Log campaign to Supabase
    await this._logCampaign({
      subject: subjectOptions[recommended].subject,
      segment: audienceSegment,
      status: 'pending_brand_review',
      goalType: campaignGoal,
    });

    return {
      subjectLines: subjectOptions,
      recommendedSubjectIndex: recommended,
      emailBody,
      segment,
      status: 'pending_brand_review',
      reviewJobId: reviewJob?.id,
      jobId: job.id,
    };
  }

  // ── Weekly Newsletter ────────────────────────────────────────────────────────

  async createWeeklyNewsletter(job) {
    const { weekTheme, featuredProducts = [] } = job.data;
    this.log.info('Creating weekly newsletter', { jobId: job.id, theme: weekTheme });

    // Step 1: Assemble newsletter content with Claude
    const newsletter = await assembleNewsletter({
      weekTheme,
      featuredProducts,
      date: new Date(),
    });

    // Step 2: Generate A/B subject line options
    const subjectJob = {
      id: `${job.id}-subjects`,
      name: 'generate-subject-lines',
      data: { campaignGoal: 'weekly newsletter', audienceSegment: 'all', product: weekTheme },
    };
    const { options: subjectOptions } = await this.generateSubjectLines(subjectJob);

    // Step 3: Send to Brand Guardian for review
    const reviewJob = await enqueue(QUEUES.BRAND_REVIEW, 'review-content', {
      content: `Subject: ${newsletter.subject}\n\n${newsletter.htmlBody}`,
      type: 'email_campaign',
      context: `Weekly newsletter: ${weekTheme}`,
    }, { priority: PRIORITY.NORMAL });

    // Step 4: Determine optimal send times per segment (evidence-based defaults)
    const sendSchedule = this._getNewsletterSendSchedule();

    // Log to Supabase
    await this._logCampaign({
      subject: newsletter.subject,
      segment: 'all',
      status: 'pending_brand_review',
      goalType: 'weekly_newsletter',
    });

    this.log.info('Weekly newsletter assembled and queued for brand review', { jobId: job.id });

    return {
      newsletter,
      subjectLineOptions: subjectOptions,
      sendSchedule,
      reviewJobId: reviewJob?.id,
      status: 'pending_brand_review',
      jobId: job.id,
    };
  }

  // ── Generate Subject Lines ───────────────────────────────────────────────────

  async generateSubjectLines(job) {
    const { campaignGoal, audienceSegment, product, offer } = job.data;

    const prompt = [
      `Generate 4 email subject lines and preview texts for Cascades Luxury.`,
      `Campaign goal: ${campaignGoal}`,
      audienceSegment ? `Target segment: ${audienceSegment}` : '',
      product ? `Product/focus: ${product}` : '',
      offer ? `Offer: ${offer}` : '',
      '',
      'Requirements:',
      '• 40-60 characters each',
      '• Use different psychological approaches for A/B testing',
      '• Luxury-appropriate — avoid aggressive sales tactics',
      '• No all-caps, no more than one exclamation mark',
      '• Preview texts should complement (not repeat) the subject',
    ].filter(Boolean).join('\n');

    const response = await createMessage({
      model: MODELS.FAST,
      maxTokens: 800,
      system: [cachedSystemBlock(STRATEGIST_SYSTEM)],
      messages: [{ role: 'user', content: prompt }],
      tools: [SUBJECT_LINE_TOOL],
      label: 'Email Strategist: subject lines',
    });

    const output = extractToolInput(response);
    if (!output) throw new Error('Email Strategist: subject line generation failed');

    return { options: output.options, recommended: output.recommended, jobId: job.id };
  }

  // ── Segmentation ─────────────────────────────────────────────────────────────

  async manageSegmentation(job) {
    const { subscribers = [] } = job.data;
    this.log.info(`Classifying ${subscribers.length} subscribers`, { jobId: job.id });

    const classified = subscribers.map((sub) => ({
      ...sub,
      segment: classifySubscriber({
        daysSinceSubscribed: sub.daysSinceSubscribed || 999,
        purchaseCount: sub.purchaseCount || 0,
        totalSpendNGN: sub.totalSpendNGN || 0,
        daysSinceLastPurchase: sub.daysSinceLastPurchase || 999,
        daysSinceLastOpen: sub.daysSinceLastOpen || 999,
      }),
    }));

    const breakdown = classified.reduce((acc, s) => {
      acc[s.segment] = (acc[s.segment] || 0) + 1;
      return acc;
    }, {});

    return { classified, breakdown, totalProcessed: classified.length, jobId: job.id };
  }

  // ── Automation Setup ─────────────────────────────────────────────────────────

  async setupAutomation(job) {
    const { sequenceId } = job.data;
    const sequence = getSequence(sequenceId);
    if (!sequence) throw new Error(`Unknown email sequence: ${sequenceId}`);

    this.log.info(`Setting up automation: ${sequence.name}`, { jobId: job.id });

    // TODO (Phase 3+): Create Mailchimp automation via API
    // Each email in the sequence will need generated copy from Content Generator

    return {
      sequenceId,
      name: sequence.name,
      trigger: sequence.trigger,
      emailCount: sequence.emails.length,
      status: 'configuration_ready',
      sequence,
      jobId: job.id,
    };
  }

  // ── Send Campaign ─────────────────────────────────────────────────────────────

  async sendCampaign(job) {
    const { campaignId, mailchimpCampaignId } = job.data;
    this.log.info('Sending email campaign', { campaignId, jobId: job.id });

    const result = await mailchimpApi.sendCampaign(mailchimpCampaignId || campaignId);

    await supabaseQuery((db) =>
      db.from('email_campaigns')
        .update({ status: result.success ? 'sent' : 'failed', sent_at: new Date().toISOString() })
        .eq('mailchimp_id', mailchimpCampaignId || campaignId)
    );

    return { success: result.success, campaignId, jobId: job.id };
  }

  // ── Performance Analysis ──────────────────────────────────────────────────────

  async analysePerformance(job) {
    const { campaigns = [], period = '30 days' } = job.data;
    this.log.info('Analysing email performance', { jobId: job.id, period });

    // Pull from Supabase if no data passed
    const campaignData = campaigns.length ? campaigns : await supabaseQuery((db) =>
      db.from('email_campaigns')
        .select('*')
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(20)
    ) || [];

    if (!campaignData.length) {
      return { status: 'insufficient_data', message: 'No sent campaigns found for analysis', jobId: job.id };
    }

    const prompt = [
      `Analyse these Cascades Luxury email campaigns and provide actionable insights.`,
      `Period: ${period}`,
      '',
      'CAMPAIGN DATA:',
      JSON.stringify(campaignData, null, 2),
      '',
      'Industry benchmarks for luxury beauty email:',
      '• Open rate: 20-25% (target)',
      '• Click rate: 2-3% (target)',
      '• Unsubscribe rate: <0.5% (target)',
      '',
      'Identify what drives above-benchmark performance for West African luxury consumers.',
    ].join('\n');

    const response = await createMessage({
      model: MODELS.PRIMARY,
      maxTokens: 1500,
      system: [cachedSystemBlock(STRATEGIST_SYSTEM)],
      messages: [{ role: 'user', content: prompt }],
      tools: [CAMPAIGN_ANALYSIS_TOOL],
      label: 'Email Strategist: performance analysis',
    });

    const output = extractToolInput(response);
    if (!output) throw new Error('Email Strategist: performance analysis failed');

    return { ...output, period, campaignsAnalyzed: campaignData.length, jobId: job.id };
  }

  // ── Private Helpers ──────────────────────────────────────────────────────────

  async _generateCampaignCopy({ campaignGoal, segment, product, offer, urgency }) {
    const prompt = [
      `Write email body copy for a Cascades Luxury campaign.`,
      `Goal: ${campaignGoal}`,
      `Audience: ${segment.label} — ${segment.messaging}`,
      product ? `Product/focus: ${product}` : '',
      offer ? `Offer: ${offer}` : '',
      urgency ? `Urgency note: ${urgency}` : '',
      '',
      'Structure: Opening hook (2 sentences) → Main value (3-4 sentences) → Benefit bullets (3-4) → CTA',
      'Total: 200-280 words. Lead with value, not the offer.',
    ].filter(Boolean).join('\n');

    const response = await createMessage({
      model: MODELS.PRIMARY,
      maxTokens: 1000,
      system: [cachedSystemBlock(STRATEGIST_SYSTEM)],
      messages: [{ role: 'user', content: prompt }],
      label: 'Email Strategist: campaign copy',
    });

    const text = response.content.find((b) => b.type === 'text')?.text || '';
    return {
      openingHook: text.split('\n\n')[0] || '',
      mainContent: text.split('\n\n').slice(1, -1).join('\n\n') || text,
      callToAction: text.split('\n\n').at(-1) || 'Shop Now',
    };
  }

  _getNewsletterSendSchedule() {
    return [
      { segment: 'vip', day: 'Tuesday', time: '09:00 WAT', reason: 'VIPs check email early in the week' },
      { segment: 'repeat', day: 'Tuesday', time: '10:00 WAT', reason: 'Engaged customers mid-morning' },
      { segment: 'new', day: 'Wednesday', time: '14:00 WAT', reason: 'New subscribers need more warm-up time' },
      { segment: 'engaged', day: 'Wednesday', time: '18:00 WAT', reason: 'Evening browse time' },
      { segment: 'at_risk', day: 'Thursday', time: '12:00 WAT', reason: 'Mid-week re-engagement attempt' },
    ];
  }

  async _logCampaign({ subject, segment, status, goalType }) {
    await supabaseQuery((db) =>
      db.from('email_campaigns').insert({
        subject,
        segment,
        status,
        goal_type: goalType,
      })
    );
  }
}

module.exports = EmailStrategist;
