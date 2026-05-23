'use strict';

const { Router } = require('express');
const orchestrator = require('../../orchestrator/orchestrator');
const { enqueue } = require('../../orchestrator/message-queue');
const { authenticate } = require('../middleware/auth');
const { QUEUES, PRIORITY } = require('../../config/constants');

const router = Router();
router.use(authenticate);

/**
 * POST /api/orchestrator/generate-content
 * Trigger content generation for any content type.
 * Body: { type, platform?, theme?, product?, ... }
 */
router.post('/generate-content', async (req, res, next) => {
  try {
    const job = await orchestrator.generateContent(req.body);
    res.json({ success: true, jobId: job?.id, message: 'Content generation queued' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orchestrator/customer-inquiry
 * Submit a customer inquiry for the Customer Service Agent.
 * Body: { customerMessage, channel, customerName?, customerHistory? }
 */
router.post('/customer-inquiry', async (req, res, next) => {
  try {
    const job = await orchestrator.handleCustomerInquiry(req.body);
    res.json({ success: true, jobId: job?.id, message: 'Inquiry queued for processing' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orchestrator/email-campaign
 * Queue an email campaign creation.
 */
router.post('/email-campaign', async (req, res, next) => {
  try {
    const job = await orchestrator.createEmailCampaign(req.body);
    res.json({ success: true, jobId: job?.id, message: 'Email campaign queued' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orchestrator/adapt-content
 * Adapt a piece of content for all social platforms.
 * Body: { originalContent, originalPlatform, targetPlatforms? }
 */
router.post('/adapt-content', async (req, res, next) => {
  try {
    const job = await enqueue(QUEUES.SOCIAL, 'adapt-cross-platform', req.body, { priority: PRIORITY.NORMAL });
    res.json({ success: true, jobId: job?.id, message: 'Cross-platform adaptation queued' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orchestrator/generate-subject-lines
 * Generate A/B test subject lines for an email campaign.
 */
router.post('/generate-subject-lines', async (req, res, next) => {
  try {
    const job = await enqueue(QUEUES.EMAIL, 'generate-subject-lines', req.body, { priority: PRIORITY.NORMAL });
    res.json({ success: true, jobId: job?.id, message: 'Subject line generation queued' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orchestrator/optimize-product
 * Queue Shopify product listing optimisation.
 */
router.post('/optimize-product', async (req, res, next) => {
  try {
    const job = await orchestrator.optimizeProduct(req.body);
    res.json({ success: true, jobId: job?.id, message: 'Product optimisation queued' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orchestrator/run-analytics
 * Manually trigger analytics aggregation.
 */
router.post('/run-analytics', async (req, res, next) => {
  try {
    const job = await orchestrator.runAnalytics(req.body);
    res.json({ success: true, jobId: job?.id, message: 'Analytics job queued' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orchestrator/status
 * Returns a snapshot of the system status.
 */
router.get('/status', async (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    skills: [
      'content-generator',
      'brand-guardian',
      'social-media-manager',
      'email-strategist',
      'customer-service-agent',
      'analytics-monitor',
      'ecommerce-optimizer',
    ],
    services: {
      redis: Boolean(process.env.REDIS_URL),
      supabase: Boolean(process.env.SUPABASE_URL),
      mongodb: Boolean(process.env.MONGODB_URI),
      buffer: Boolean(process.env.BUFFER_ACCESS_TOKEN),
      mailchimp: Boolean(process.env.MAILCHIMP_API_KEY),
      shopify: Boolean(process.env.SHOPIFY_ACCESS_TOKEN),
    },
  });
});

module.exports = router;
