'use strict';

const { Router } = require('express');
const orchestrator = require('../../orchestrator/orchestrator');
const { enqueue } = require('../../orchestrator/message-queue');
const { authenticate } = require('../middleware/auth');
const { requireFeature, checkOpsLimit } = require('../middleware/plan-gate');
const { QUEUES, PRIORITY } = require('../../config/constants');

const router = Router();
router.use(authenticate);

// ── Field allowlists ────────────────────────────────────────────────────────

function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
}

const CONTENT_FIELDS = ['type', 'platform', 'theme', 'product', 'audience', 'tone',
  'campaignGoal', 'audienceSegment', 'offer', 'urgency', 'topic', 'targetKeyword', 'wordCount',
  'productName', 'brand', 'fragranceNotes', 'priceNGN', 'size', 'targetAudience',
  'uniqueSellingPoints', 'month', 'year', 'keyEvents', 'productLaunches',
  'duration', 'contentPillar', 'format', 'concept', 'mood', 'copyOverlay', 'numberOfVariants'];

const INQUIRY_FIELDS = ['customerMessage', 'channel', 'customerName', 'customerHistory',
  'customerId', 'tidioConversationId'];

const EMAIL_CAMPAIGN_FIELDS = ['campaignGoal', 'audienceSegment', 'product', 'offer', 'urgency'];

const ADAPT_CONTENT_FIELDS = ['originalContent', 'originalPlatform', 'targetPlatforms'];

const SUBJECT_LINE_FIELDS = ['campaignGoal', 'audienceSegment', 'product', 'offer'];

const OPTIMIZE_PRODUCT_FIELDS = ['productId', 'productData'];

const RUN_ANALYTICS_FIELDS = ['period', 'trigger'];

/**
 * POST /api/orchestrator/generate-content
 * Trigger content generation for any content type.
 */
router.post('/generate-content', checkOpsLimit, async (req, res, next) => {
  try {
    const data = { ...pick(req.body, CONTENT_FIELDS), tenantId: req.tenantId };
    const job = await orchestrator.generateContent(data);
    res.json({ success: true, jobId: job?.id, message: 'Content generation queued' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orchestrator/customer-inquiry
 * Submit a customer inquiry for the Customer Service Agent.
 */
router.post('/customer-inquiry', async (req, res, next) => {
  try {
    const data = { ...pick(req.body, INQUIRY_FIELDS), tenantId: req.tenantId };
    const job = await orchestrator.handleCustomerInquiry(data);
    res.json({ success: true, jobId: job?.id, message: 'Inquiry queued for processing' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orchestrator/email-campaign
 * Queue an email campaign creation.
 */
router.post('/email-campaign', requireFeature('emailCampaigns'), checkOpsLimit, async (req, res, next) => {
  try {
    const data = { ...pick(req.body, EMAIL_CAMPAIGN_FIELDS), tenantId: req.tenantId };
    const job = await orchestrator.createEmailCampaign(data);
    res.json({ success: true, jobId: job?.id, message: 'Email campaign queued' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orchestrator/adapt-content
 * Adapt a piece of content for all social platforms.
 */
router.post('/adapt-content', async (req, res, next) => {
  try {
    const data = { ...pick(req.body, ADAPT_CONTENT_FIELDS), tenantId: req.tenantId };
    const job = await enqueue(QUEUES.SOCIAL, 'adapt-cross-platform', data, { priority: PRIORITY.NORMAL });
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
    const data = { ...pick(req.body, SUBJECT_LINE_FIELDS), tenantId: req.tenantId };
    const job = await enqueue(QUEUES.EMAIL, 'generate-subject-lines', data, { priority: PRIORITY.NORMAL });
    res.json({ success: true, jobId: job?.id, message: 'Subject line generation queued' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orchestrator/optimize-product
 * Queue Shopify product listing optimisation.
 */
router.post('/optimize-product', requireFeature('ecommerceOptimizer'), checkOpsLimit, async (req, res, next) => {
  try {
    const data = { ...pick(req.body, OPTIMIZE_PRODUCT_FIELDS), tenantId: req.tenantId };
    const job = await orchestrator.optimizeProduct(data);
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
    const data = { ...pick(req.body, RUN_ANALYTICS_FIELDS), tenantId: req.tenantId };
    const job = await orchestrator.runAnalytics(data);
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
