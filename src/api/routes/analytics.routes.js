'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { enqueue } = require('../../orchestrator/message-queue');
const { supabaseQuery } = require('../../services/database/supabase-client');
const { isMongoAvailable } = require('../../services/database/mongodb-client');
const Content = require('../../models/content.model');
const Decision = require('../../models/decision.model');
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
    const data = await supabaseQuery((db) =>
      db.from('escalations').select('*').eq('resolved', false).order('created_at', { ascending: false }).limit(50)
    );
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

/**
 * POST /api/analytics/social-performance
 * Queue a social media performance analysis for a platform.
 */
router.post('/social-performance', async (req, res, next) => {
  try {
    const job = await enqueue(QUEUES.SOCIAL, 'optimize-performance', req.body, { priority: PRIORITY.LOW });
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
    const job = await enqueue(QUEUES.EMAIL, 'analyse-performance', req.body, { priority: PRIORITY.LOW });
    res.json({ success: true, jobId: job?.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
