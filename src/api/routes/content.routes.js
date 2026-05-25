'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { checkOpsLimit } = require('../middleware/plan-gate');
const BrandGuardian = require('../../skills/brand-guardian/brand-guardian');
const ContentGenerator = require('../../skills/content-generator/content-generator');
const { localiseContent } = require('../../skills/content-generator/localiser');
const { getBrandConfig } = require('../../services/brand-config');
const { isMongoAvailable } = require('../../services/database/mongodb-client');
const Content = require('../../models/content.model');
const { enqueue } = require('../../orchestrator/message-queue');
const { supabaseQuery } = require('../../services/database/supabase-client');
const { eventBus, EVENTS } = require('../../services/messaging/event-emitter');
const { QUEUES, PRIORITY } = require('../../config/constants');
const { notify } = require('../../services/notifications');

const router = Router();
router.use(authenticate);

const brandGuardian = new BrandGuardian();
const contentGenerator = new ContentGenerator();

const SUPPORTED_LANGUAGES = { fr: 'French', sw: 'Swahili', yo: 'Yoruba', ar: 'Arabic' };

/**
 * POST /api/content/review
 * Synchronously review a piece of content for brand compliance.
 * Body: { content, type, platform? }
 */
router.post('/review', async (req, res, next) => {
  try {
    const { content, type, platform } = req.body;
    if (!content || !type) return res.status(400).json({ error: 'content and type are required' });
    const result = await brandGuardian.reviewSync({ content, type, platform });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/content/generate
 * Synchronously generate a single piece of content.
 * Body: { type: 'social_caption'|'product_description'|..., ...options }
 *
 * For production use, prefer the async queue via /api/orchestrator/generate-content.
 */
router.post('/generate', async (req, res, next) => {
  try {
    const fakeJob = { id: `api-${Date.now()}`, name: 'generate-content', data: { ...req.body, tenantId: req.tenantId } };
    const result = await contentGenerator.execute(fakeJob);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/content/localise
 * Localise content into one or more languages (fr, sw, yo, ar).
 * Body: { content, targetLanguages, contentType?, platform? }
 */
router.post('/localise', checkOpsLimit, async (req, res, next) => {
  try {
    const { content, targetLanguages, contentType, platform } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });
    if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
      return res.status(400).json({ error: 'targetLanguages must be a non-empty array', supported: Object.keys(SUPPORTED_LANGUAGES) });
    }
    const invalid = targetLanguages.filter((l) => !SUPPORTED_LANGUAGES[l]);
    if (invalid.length) {
      return res.status(400).json({ error: `Unsupported languages: ${invalid.join(', ')}`, supported: Object.keys(SUPPORTED_LANGUAGES) });
    }
    const brandConfig = await getBrandConfig(req.tenantId || null);
    const result = await localiseContent(content, targetLanguages, brandConfig, contentType || 'social_caption', platform);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/content/languages
 * Lists supported localisation languages.
 */
router.get('/languages', (req, res) => {
  res.json({ supported: SUPPORTED_LANGUAGES });
});

/**
 * POST /api/content/:id/regenerate-image
 * Enqueues a new image generation job for an approved content piece.
 */
router.post('/:id/regenerate-image', async (req, res, next) => {
  try {
    if (!isMongoAvailable()) {
      return res.status(503).json({ error: 'Content database not available' });
    }

    const content = await Content.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!content) return res.status(404).json({ error: 'Content not found' });

    if (!['social_caption', 'image_brief'].includes(content.type)) {
      return res.status(400).json({ error: 'Image generation is only available for social captions' });
    }

    const job = await enqueue(
      QUEUES.IMAGE_GENERATION,
      'generate-image',
      { contentId: String(content._id), tenantId: req.tenantId, platform: content.platform },
      { priority: PRIORITY.NORMAL }
    );

    await Content.findByIdAndUpdate(content._id, { imageStatus: 'generating' });

    res.json({ queued: true, jobId: String(job.id) });
  } catch (err) { next(err); }
});

// ── Content Approval Gate ──────────────────────────────────────────────────────

/**
 * GET /api/content/approvals
 * List pending (and recent resolved) content approvals for the tenant.
 */
router.get('/approvals', async (req, res, next) => {
  try {
    const rows = await supabaseQuery((db) =>
      db.from('content_approvals')
        .select('id, content_preview, platform, content_type, brand_score, review_summary, status, decided_at, created_at')
        .eq('tenant_id', req.tenantId)
        .order('created_at', { ascending: false })
        .limit(50)
    );
    res.json({ data: rows || [] });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/content/approvals/:id/approve
 * Approve a pending content item — fires CONTENT_APPROVED so the orchestrator publishes it.
 */
router.patch('/approvals/:id/approve', async (req, res, next) => {
  try {
    const row = await supabaseQuery((db) =>
      db.from('content_approvals')
        .select('*')
        .eq('id', req.params.id)
        .eq('tenant_id', req.tenantId)
        .single()
    );
    if (!row) return res.status(404).json({ error: 'Approval not found' });
    if (row.status !== 'pending') return res.status(409).json({ error: 'Already decided', status: row.status });

    await supabaseQuery((db) =>
      db.from('content_approvals')
        .update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: req.userEmail || null })
        .eq('id', req.params.id)
    );

    // Replay the original job data through the content_approved event
    eventBus.publish(EVENTS.CONTENT_APPROVED, {
      ...row.job_data,
      approvalId: row.id,
      humanApproved: true,
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/content/approvals/:id/reject
 * Reject a pending content item with an optional reason.
 * Body: { reason?: string }
 */
router.patch('/approvals/:id/reject', async (req, res, next) => {
  try {
    const row = await supabaseQuery((db) =>
      db.from('content_approvals')
        .select('id, status, tenant_id')
        .eq('id', req.params.id)
        .eq('tenant_id', req.tenantId)
        .single()
    );
    if (!row) return res.status(404).json({ error: 'Approval not found' });
    if (row.status !== 'pending') return res.status(409).json({ error: 'Already decided', status: row.status });

    await supabaseQuery((db) =>
      db.from('content_approvals')
        .update({
          status: 'rejected',
          decided_at: new Date().toISOString(),
          decided_by: req.userEmail || null,
          rejection_reason: req.body.reason || null,
        })
        .eq('id', req.params.id)
    );

    await notify(req.tenantId, {
      type: 'content_rejected',
      title: 'Content rejected',
      body: req.body.reason
        ? `Your content was rejected: ${req.body.reason}`
        : 'A reviewer rejected your content. Please revise and resubmit.',
      link: '/dashboard/content/approvals',
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/content/approval-gate
 * Toggle the human-approval gate for this tenant.
 * Body: { enabled: boolean }
 */
router.patch('/approval-gate', async (req, res, next) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });

    await supabaseQuery((db) =>
      db.from('tenants')
        .update({ settings: { require_content_approval: enabled } })
        .eq('id', req.tenantId)
    );

    res.json({ ok: true, require_content_approval: enabled });
  } catch (err) { next(err); }
});

/**
 * GET /api/content/approval-gate
 * Returns the current approval gate setting for the tenant.
 */
router.get('/approval-gate', async (req, res, next) => {
  try {
    const row = await supabaseQuery((db) =>
      db.from('tenants').select('settings').eq('id', req.tenantId).single()
    );
    res.json({ require_content_approval: row?.settings?.require_content_approval === true });
  } catch (err) { next(err); }
});

// GET /api/content/calendar — scheduled content in a date range
router.get('/calendar', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from ? String(from) : new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const toDate   = to   ? String(to)   : new Date(Date.now() + 37 * 86400000).toISOString().slice(0, 10);

    const items = await supabaseQuery((db) =>
      db.from('content_schedule')
        .select('id, platform, content_type, scheduled_at, status, content, posted_at')
        .eq('tenant_id', req.tenantId)
        .gte('scheduled_at', fromDate + 'T00:00:00Z')
        .lte('scheduled_at', toDate   + 'T23:59:59Z')
        .order('scheduled_at', { ascending: true })
    );
    res.json({ items: items || [] });
  } catch (err) { next(err); }
});

module.exports = router;
