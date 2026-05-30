'use strict';

const logger = require('../utils/logger');
const { enqueue, registerWorker } = require('./message-queue');
const { eventBus, EVENTS } = require('../services/messaging/event-emitter');
const { QUEUES, SKILLS, PRIORITY } = require('../config/constants');
const Content = require('../models/content.model');

const { notify } = require('../services/notifications');
const { supabaseQuery } = require('../services/database/supabase-client');

// Skill imports — each skill registers itself as a BullMQ worker
const BrandGuardian = require('../skills/brand-guardian/brand-guardian');
const ContentGenerator = require('../skills/content-generator/content-generator');
const SocialMediaManager = require('../skills/social-media-manager/social-media-manager');
const EmailStrategist = require('../skills/email-strategist/email-strategist');
const CustomerServiceAgent = require('../skills/customer-service-agent/customer-service-agent');
const AnalyticsMonitor = require('../skills/analytics-monitor/analytics-monitor');
const EcommerceOptimizer = require('../skills/ecommerce-optimizer/ecommerce-optimizer');
const VisualDesigner = require('../skills/visual-designer');
const VideoProducer = require('../skills/video-producer');

class Orchestrator {
  constructor() {
    this.log = logger.forSkill(SKILLS.ORCHESTRATOR);
    this.skills = {};
  }

  /**
   * Starts all skills and registers their queue workers.
   */
  async init() {
    this.log.info('Initialising Orchestrator...');

    // Instantiate all skills
    this.skills[SKILLS.BRAND_GUARDIAN] = new BrandGuardian();
    this.skills[SKILLS.CONTENT_GENERATOR] = new ContentGenerator();
    this.skills[SKILLS.SOCIAL_MEDIA_MANAGER] = new SocialMediaManager();
    this.skills[SKILLS.EMAIL_STRATEGIST] = new EmailStrategist();
    this.skills[SKILLS.CUSTOMER_SERVICE] = new CustomerServiceAgent();
    this.skills[SKILLS.ANALYTICS_MONITOR] = new AnalyticsMonitor();
    this.skills[SKILLS.ECOMMERCE_OPTIMIZER] = new EcommerceOptimizer();
    this.skills[SKILLS.VISUAL_DESIGNER] = new VisualDesigner();
    this.skills[SKILLS.VIDEO_PRODUCER] = new VideoProducer();

    // Register each skill as a queue worker
    registerWorker(QUEUES.BRAND_REVIEW, this.skills[SKILLS.BRAND_GUARDIAN]);
    registerWorker(QUEUES.CONTENT, this.skills[SKILLS.CONTENT_GENERATOR]);
    registerWorker(QUEUES.SOCIAL, this.skills[SKILLS.SOCIAL_MEDIA_MANAGER]);
    registerWorker(QUEUES.EMAIL, this.skills[SKILLS.EMAIL_STRATEGIST]);
    registerWorker(QUEUES.CUSTOMER_SERVICE, this.skills[SKILLS.CUSTOMER_SERVICE]);
    registerWorker(QUEUES.ANALYTICS, this.skills[SKILLS.ANALYTICS_MONITOR]);
    registerWorker(QUEUES.ECOMMERCE, this.skills[SKILLS.ECOMMERCE_OPTIMIZER]);
    registerWorker(QUEUES.IMAGE_GENERATION, this.skills[SKILLS.VISUAL_DESIGNER]);
    registerWorker(QUEUES.VIDEO_GENERATION, this.skills[SKILLS.VIDEO_PRODUCER]);

    this._registerEventHandlers();
    this.log.info('Orchestrator ready — all skills online');
  }

  // ── Public API for external triggers ──────────────────────────────────────

  async generateContent(request) {
    this.log.info('Orchestrating content generation request', { type: request.type });
    return enqueue(QUEUES.CONTENT, 'generate-content', request, {
      priority: PRIORITY.NORMAL,
    });
  }

  async reviewContent(contentData) {
    return enqueue(QUEUES.BRAND_REVIEW, 'review-content', contentData, {
      priority: PRIORITY.HIGH,
    });
  }

  async handleCustomerInquiry(inquiry) {
    this.log.info('Routing customer inquiry', { channel: inquiry.channel });
    return enqueue(QUEUES.CUSTOMER_SERVICE, 'handle-inquiry', inquiry, {
      priority: inquiry.sentiment === 'angry' ? PRIORITY.URGENT : PRIORITY.HIGH,
    });
  }

  async schedulePost(postData) {
    return enqueue(QUEUES.SOCIAL, 'schedule-post', postData, { priority: PRIORITY.NORMAL });
  }

  async createEmailCampaign(campaignData) {
    return enqueue(QUEUES.EMAIL, 'create-campaign', campaignData, { priority: PRIORITY.NORMAL });
  }

  async runAnalytics(params = {}) {
    return enqueue(QUEUES.ANALYTICS, 'aggregate-daily-metrics', params, { priority: PRIORITY.LOW });
  }

  async optimizeProduct(productData) {
    return enqueue(QUEUES.ECOMMERCE, 'optimize-product', productData, { priority: PRIORITY.NORMAL });
  }

  // ── Event-driven routing ───────────────────────────────────────────────────

  _registerEventHandlers() {
    // Negative sentiment → escalate immediately
    eventBus.subscribe(EVENTS.NEGATIVE_SENTIMENT, SKILLS.ORCHESTRATOR, async (data) => {
      this.log.warn('Negative sentiment detected — routing for urgent response', data);
      await enqueue(QUEUES.CUSTOMER_SERVICE, 'handle-inquiry', data, { priority: PRIORITY.URGENT });
      await notify(data.tenantId, {
        type: 'negative_sentiment',
        title: 'Negative sentiment detected',
        body: `A customer message on ${data.channel || 'your channel'} was flagged as negative. Routing to customer service.`,
        link: '/dashboard/escalations',
      });
      await this._notifyHumanManager({ type: EVENTS.NEGATIVE_SENTIMENT, ...data });
    });

    // Content approved → route based on content type
    eventBus.subscribe(EVENTS.CONTENT_APPROVED, SKILLS.ORCHESTRATOR, async (data) => {
      if (data.type === 'email_campaign') {
        // Email campaigns: send via Mailchimp if a draft was created
        if (data.mailchimpCampaignId) {
          this.log.info('Email campaign approved — sending via Mailchimp', { campaignId: data.emailCampaignId });
          await enqueue(QUEUES.EMAIL, 'send-campaign', {
            campaignId: data.emailCampaignId,
            mailchimpCampaignId: data.mailchimpCampaignId,
            tenantId: data.tenantId,
          }, { priority: PRIORITY.NORMAL });
        } else {
          this.log.warn('Email campaign approved but no Mailchimp draft — manual send required', { emailCampaignId: data.emailCampaignId });
        }
        // Notify tenant: content approved and queued
        if (data.tenantId) {
          await notify(data.tenantId, {
            type: 'content_approved',
            title: 'Content approved and scheduled',
            body: data.humanApproved
              ? 'An admin approved your content. It has been queued for publishing.'
              : 'Your content passed brand review and has been queued for publishing.',
            link: '/dashboard/content',
          });
        }
        return;
      }

      // Social content: route to video, image, or immediate scheduling
      this.log.info('Content approved — routing social content', { platform: data.platform, tenantId: data.tenantId });

      const MEDIA_REQUIRED_PLATFORMS = ['instagram', 'tiktok'];
      const needsMedia = MEDIA_REQUIRED_PLATFORMS.includes(data.platform);
      const canGenerateMedia = !!(data.contentId && data.type === 'social_caption');

      if (needsMedia && canGenerateMedia) {
        // Check if tenant has HeyGen configured — prefer video for Reels/TikTok
        const { getHeyGenClient } = require('../services/api-clients/heygen-api');
        const heygenClient = await getHeyGenClient(data.tenantId).catch(() => null);

        if (heygenClient) {
          // Video-first: generate HeyGen avatar video, then schedule-post fires from VIDEO_GENERATED
          this.log.info(`[Orchestrator] ${data.platform} — HeyGen configured, generating avatar video`, { contentId: data.contentId });
          await Content.findByIdAndUpdate(data.contentId, {
            videoStatus: 'generating',
            videoGeneratingAt: new Date(),
          }).catch(() => {});
          await enqueue(QUEUES.VIDEO_GENERATION, 'generate-video', data, { priority: PRIORITY.NORMAL });
        } else {
          // Image-first: generate image, then schedule-post fires from IMAGE_GENERATED
          this.log.info(`[Orchestrator] ${data.platform} — no HeyGen, generating image`, { contentId: data.contentId });
          await Content.findByIdAndUpdate(data.contentId, {
            imageStatus: 'generating',
            imageGeneratingAt: new Date(),
          }).catch(() => {});
          await enqueue(QUEUES.IMAGE_GENERATION, 'generate-image', data, { priority: PRIORITY.NORMAL });
        }
      } else {
        // Non-media platforms: schedule immediately; generate image in background if applicable
        const jobs = [enqueue(QUEUES.SOCIAL, 'schedule-post', data, { priority: PRIORITY.NORMAL })];
        if (canGenerateMedia) {
          await Content.findByIdAndUpdate(data.contentId, {
            imageStatus: 'generating',
            imageGeneratingAt: new Date(),
          }).catch(() => {});
          jobs.push(enqueue(QUEUES.IMAGE_GENERATION, 'generate-image', data, { priority: PRIORITY.LOW }));
        }
        await Promise.all(jobs);
      }
      // Notify tenant: content approved and queued
      if (data.tenantId) {
        await notify(data.tenantId, {
          type: 'content_approved',
          title: 'Content approved and scheduled',
          body: data.humanApproved
            ? 'An admin approved your content. It has been queued for publishing.'
            : 'Your content passed brand review and has been queued for publishing.',
          link: '/dashboard/content',
        });
      }
    });

    // Image ready → schedule the post (used by Instagram/TikTok image-first flow)
    eventBus.subscribe(EVENTS.IMAGE_GENERATED, SKILLS.ORCHESTRATOR, async (data) => {
      this.log.info('[Orchestrator] Image generated — enqueuing schedule-post', { contentId: data.contentId, platform: data.platform, imageUrl: data.imageUrl });
      await enqueue(QUEUES.SOCIAL, 'schedule-post', data, { priority: PRIORITY.NORMAL });
    });

    // HeyGen video ready → schedule the post with videoUrl
    eventBus.subscribe(EVENTS.VIDEO_GENERATED, SKILLS.ORCHESTRATOR, async (data) => {
      this.log.info('[Orchestrator] Video generated — enqueuing schedule-post', { contentId: data.contentId, platform: data.platform });
      await enqueue(QUEUES.SOCIAL, 'schedule-post', data, { priority: PRIORITY.NORMAL });
    });

    // HeyGen unavailable (no API key) → fall back to image generation
    eventBus.subscribe(EVENTS.VIDEO_GENERATION_UNAVAILABLE, SKILLS.ORCHESTRATOR, async (data) => {
      this.log.info('[Orchestrator] Video unavailable — falling back to image generation', { contentId: data.contentId, platform: data.platform });
      if (data.contentId) {
        await Content.findByIdAndUpdate(data.contentId, {
          imageStatus: 'generating',
          imageGeneratingAt: new Date(),
        }).catch(() => {});
      }
      await enqueue(QUEUES.IMAGE_GENERATION, 'generate-image', data, { priority: PRIORITY.NORMAL });
    });

    // Any escalation → persist to DB + notify human manager
    eventBus.subscribe(EVENTS.ESCALATION_REQUIRED, SKILLS.ORCHESTRATOR, async (data) => {
      // Write to escalations table so the dashboard shows it
      await supabaseQuery((db) =>
        db.from('escalations').insert({
          tenant_id: data.tenantId || null,
          type: data.type || 'escalation',
          skill: data.skill || null,
          job_id: data.jobId ? String(data.jobId) : null,
          reason: data.reason || null,
          payload: data,
          resolved: false,
        })
      ).catch((err) => this.log.error('Failed to persist escalation', { error: err?.message }));

      await notify(data.tenantId, {
        type: 'escalation',
        title: 'Action required: escalation',
        body: data.reason || `A ${data.type || 'task'} requires your attention.`,
        link: '/dashboard/escalations',
      });
      await this._notifyHumanManager(data);
    });

    // Sales spike → trigger analytics + email
    eventBus.subscribe(EVENTS.SALES_SPIKE, SKILLS.ORCHESTRATOR, async (data) => {
      await enqueue(QUEUES.ANALYTICS, 'analyse-sales-spike', data, { priority: PRIORITY.HIGH });
      if (data.tenantId) {
        await notify(data.tenantId, {
          type: 'sales_spike',
          title: 'Sales spike detected',
          body: `Unusual sales activity detected from ${data.source || 'your store'}. AI is analysing the cause now.`,
          link: '/dashboard/analytics',
        });
      }
    });
  }

  async _notifyHumanManager(payload) {
    const webhookUrl = process.env.ESCALATION_WEBHOOK_URL;
    if (!webhookUrl) {
      this.log.warn('ESCALATION_WEBHOOK_URL not set — human escalation notification skipped', payload);
      return;
    }
    try {
      const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'AI Social Media Manager', ...payload }),
      });
      this.log.info('Human manager notified via webhook', { type: payload.type });
    } catch (err) {
      this.log.error('Failed to notify human manager', { error: err });
    }
  }
}

// Singleton
const orchestrator = new Orchestrator();
module.exports = orchestrator;
