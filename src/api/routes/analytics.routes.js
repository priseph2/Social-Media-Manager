'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/plan-gate');
const { enqueue } = require('../../orchestrator/message-queue');
const { supabaseQuery } = require('../../services/database/supabase-client');
const { isMongoAvailable } = require('../../services/database/mongodb-client');
const Content = require('../../models/content.model');
const Decision = require('../../models/decision.model');
const { getTopAttributedContent } = require('../../skills/analytics-monitor/revenue-attributor');
const { QUEUES, PRIORITY } = require('../../config/constants');

const router = Router();
router.use(authenticate);

/**
 * GET /api/analytics/dashboard
 * Returns a quick dashboard snapshot for the human manager.
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const [escalations, recentContent, recentDecisions] = await Promise.all([
      supabaseQuery((db) =>
        db.from('escalations').select('id, type, reason, created_at').eq('resolved', false).limit(10)
      ),
      isMongoAvailable()
        ? Content.find({ 'brandReview.status': { $in: ['approved', 'pending'] } })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('type platform brandReview.status createdAt')
            .lean()
        : [],
      isMongoAvailable()
        ? Decision.find().sort({ createdAt: -1 }).limit(5).select('skill action escalated createdAt').lean()
        : [],
    ]);

    const scheduledContent = await supabaseQuery((db) =>
      db.from('content_schedule')
        .select('platform, content_type, scheduled_at, status')
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(10)
    );

    res.json({
      timestamp: new Date().toISOString(),
      escalations: escalations || [],
      recentContent,
      recentDecisions,
      upcoming: scheduledContent || [],
      services: {
        redis: Boolean(process.env.REDIS_URL),
        supabase: Boolean(process.env.SUPABASE_URL),
        mongodb: Boolean(process.env.MONGODB_URI),
        buffer: Boolean(process.env.BUFFER_ACCESS_TOKEN),
        mailchimp: Boolean(process.env.MAILCHIMP_API_KEY),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/analytics/content?type=social_caption&platform=instagram&limit=20
 * Returns recent content with brand review status.
 */
router.get('/content', async (req, res, next) => {
  try {
    if (!isMongoAvailable()) return res.json({ data: [], message: 'MongoDB not configured' });
    const { type, platform, limit = 20 } = req.query;
    const filter = {};
    if (req.tenantId) filter.tenantId = req.tenantId;
    if (type) filter.type = type;
    if (platform) filter.platform = platform;
    const docs = await Content.find(filter).sort({ createdAt: -1 }).limit(Number(limit)).lean();
    res.json({ data: docs, count: docs.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/analytics/escalations
 * Returns open escalations requiring human attention.
 */
router.get('/escalations', async (req, res, next) => {
  try {
    const data = await supabaseQuery((db) => {
      let q = db.from('escalations').select('*').eq('resolved', false);
      if (req.tenantId) q = q.eq('tenant_id', req.tenantId);
      return q.order('created_at', { ascending: false }).limit(50);
    });
    res.json({ data: data || [], count: data?.length || 0 });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/analytics/escalations/:id/resolve
 * Mark an escalation as resolved with a human note.
 */
router.patch('/escalations/:id/resolve', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { humanNote } = req.body;
    await supabaseQuery((db) =>
      db.from('escalations')
        .update({ resolved: true, human_note: humanNote, resolved_at: new Date().toISOString() })
        .eq('id', id)
    );
    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

// ── Advanced Analytics (Phase 9) ─────────────────────────────────────────────

/**
 * POST /api/analytics/predict-performance
 * Predicts engagement and reach for a content piece before publishing.
 * Body: { contentText, platform, scheduledAt?, contentId? }
 */
router.post('/predict-performance', requireFeature('advancedAnalytics'), async (req, res, next) => {
  try {
    const { contentText, platform, scheduledAt, contentId } = req.body;
    if (!contentText || !platform) return res.status(400).json({ error: 'contentText and platform are required' });
    const job = await enqueue(QUEUES.ANALYTICS, 'predict-content-performance', {
      tenantId: req.tenantId, contentText, platform, scheduledAt, contentId,
    }, { priority: PRIORITY.HIGH });
    res.json({ success: true, jobId: job?.id, message: 'Performance prediction queued' });
  } catch (err) { next(err); }
});

/**
 * POST /api/analytics/benchmark
 * Runs a full competitor benchmark analysis for the tenant.
 */
router.post('/benchmark', requireFeature('advancedAnalytics'), async (req, res, next) => {
  try {
    const job = await enqueue(QUEUES.ANALYTICS, 'run-competitor-benchmark',
      { tenantId: req.tenantId },
      { priority: PRIORITY.LOW }
    );
    res.json({ success: true, jobId: job?.id, message: 'Benchmark analysis queued' });
  } catch (err) { next(err); }
});

/**
 * GET /api/analytics/reports
 * Lists stored monthly reports for the tenant.
 */
router.get('/reports', requireFeature('advancedAnalytics'), async (req, res, next) => {
  try {
    const reports = await supabaseQuery((db) =>
      db.from('monthly_reports')
        .select('id, period, title, overall_score, generated_at')
        .eq('tenant_id', req.tenantId)
        .order('period', { ascending: false })
        .limit(24)
    ) || [];
    res.json({ reports });
  } catch (err) { next(err); }
});

/**
 * GET /api/analytics/reports/:period
 * Fetches a specific monthly report (period = 'YYYY-MM').
 */
router.get('/reports/:period', requireFeature('advancedAnalytics'), async (req, res, next) => {
  try {
    const report = await supabaseQuery((db) =>
      db.from('monthly_reports')
        .select('*')
        .eq('tenant_id', req.tenantId)
        .eq('period', req.params.period)
        .maybeSingle()
    );
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  } catch (err) { next(err); }
});

/**
 * POST /api/analytics/reports/generate
 * Triggers generation of the monthly narrative report.
 * Body: { period? } — defaults to current month.
 */
router.post('/reports/generate', requireFeature('advancedAnalytics'), async (req, res, next) => {
  try {
    const period = req.body.period || new Date().toISOString().slice(0, 7);
    const job = await enqueue(QUEUES.ANALYTICS, 'generate-monthly-report',
      { tenantId: req.tenantId, period },
      { priority: PRIORITY.LOW }
    );
    res.json({ success: true, jobId: job?.id, period, message: 'Monthly report generation queued — check back in ~2 minutes' });
  } catch (err) { next(err); }
});

/**
 * GET /api/analytics/attribution
 * Returns top revenue-attributed content pieces for the past N days.
 */
router.get('/attribution', requireFeature('advancedAnalytics'), async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 90);
    const topContent = await getTopAttributedContent(req.tenantId, days);

    // Enrich with Content data from MongoDB if available
    let enriched = topContent;
    if (isMongoAvailable() && topContent.length) {
      const ids = topContent.map((c) => c.contentId).filter(Boolean);
      const docs = await Content.find({ _id: { $in: ids } })
        .select('_id type platform variations.text postedAt performance')
        .lean();
      const docMap = Object.fromEntries(docs.map((d) => [String(d._id), d]));
      enriched = topContent.map((c) => ({
        ...c,
        content: docMap[c.contentId] || null,
      }));
    }

    res.json({ topContent: enriched, days, tenantId: req.tenantId });
  } catch (err) { next(err); }
});

/**
 * POST /api/analytics/social-performance
 * Queue a social media performance analysis for a platform.
 */
router.post('/social-performance', async (req, res, next) => {
  try {
    const job = await enqueue(QUEUES.SOCIAL, 'optimize-performance', { ...req.body, tenantId: req.tenantId }, { priority: PRIORITY.LOW });
    res.json({ success: true, jobId: job?.id });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/analytics/email-performance
 * Queue an email campaign performance analysis.
 */
router.post('/email-performance', async (req, res, next) => {
  try {
    const job = await enqueue(QUEUES.EMAIL, 'analyse-performance', { ...req.body, tenantId: req.tenantId }, { priority: PRIORITY.LOW });
    res.json({ success: true, jobId: job?.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
