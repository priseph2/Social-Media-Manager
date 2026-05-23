'use strict';

const logger = require('../utils/logger');
const { enqueue, registerWorker } = require('./message-queue');
const { eventBus, EVENTS } = require('../services/messaging/event-emitter');
const { QUEUES, SKILLS, PRIORITY } = require('../config/constants');

// Skill imports — each skill registers itself as a BullMQ worker
const BrandGuardian = require('../skills/brand-guardian/brand-guardian');
const ContentGenerator = require('../skills/content-generator/content-generator');
const SocialMediaManager = require('../skills/social-media-manager/social-media-manager');
const EmailStrategist = require('../skills/email-strategist/email-strategist');
const CustomerServiceAgent = require('../skills/customer-service-agent/customer-service-agent');
const AnalyticsMonitor = require('../skills/analytics-monitor/analytics-monitor');
const EcommerceOptimizer = require('../skills/ecommerce-optimizer/ecommerce-optimizer');

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

    // Register each skill as a queue worker
    registerWorker(QUEUES.BRAND_REVIEW, this.skills[SKILLS.BRAND_GUARDIAN]);
    registerWorker(QUEUES.CONTENT, this.skills[SKILLS.CONTENT_GENERATOR]);
    registerWorker(QUEUES.SOCIAL, this.skills[SKILLS.SOCIAL_MEDIA_MANAGER]);
    registerWorker(QUEUES.EMAIL, this.skills[SKILLS.EMAIL_STRATEGIST]);
    registerWorker(QUEUES.CUSTOMER_SERVICE, this.skills[SKILLS.CUSTOMER_SERVICE]);
    registerWorker(QUEUES.ANALYTICS, this.skills[SKILLS.ANALYTICS_MONITOR]);
    registerWorker(QUEUES.ECOMMERCE, this.skills[SKILLS.ECOMMERCE_OPTIMIZER]);

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
      await this._notifyHumanManager({ type: EVENTS.NEGATIVE_SENTIMENT, ...data });
    });

    // Content approved → route to social media for scheduling
    eventBus.subscribe(EVENTS.CONTENT_APPROVED, SKILLS.ORCHESTRATOR, async (data) => {
      this.log.info('Content approved — routing to Social Media Manager', data);
      await enqueue(QUEUES.SOCIAL, 'schedule-post', data, { priority: PRIORITY.NORMAL });
    });

    // Any escalation → notify human manager
    eventBus.subscribe(EVENTS.ESCALATION_REQUIRED, SKILLS.ORCHESTRATOR, async (data) => {
      await this._notifyHumanManager(data);
    });

    // Sales spike → trigger analytics + email
    eventBus.subscribe(EVENTS.SALES_SPIKE, SKILLS.ORCHESTRATOR, async (data) => {
      await enqueue(QUEUES.ANALYTICS, 'analyse-sales-spike', data, { priority: PRIORITY.HIGH });
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
        body: JSON.stringify({ source: 'Cascades Luxury AI', ...payload }),
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
