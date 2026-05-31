'use strict';

const { Router } = require('express');
const { enqueue } = require('../../orchestrator/message-queue');
const { QUEUES, PRIORITY } = require('../../config/constants');
const { getSupabaseClient } = require('../../services/database/supabase-client');
const logger = require('../../utils/logger');

const router = Router();

async function getActiveTenantIds() {
  const db = getSupabaseClient();
  if (!db) {
    const fallback = process.env.DEFAULT_TENANT_ID;
    return fallback ? [fallback] : [];
  }
  const { data } = await db.from('tenants').select('id').eq('status', 'active');
  return (data || []).map((t) => t.id);
}

/**
 * POST /api/cron/trigger
 * Called by the Vercel daily cron job at 08:00 WAT.
 * Validates x-cron-secret, then enqueues daily content generation
 * for every active tenant — same jobs the in-process scheduler fires.
 *
 * This endpoint keeps the Render backend from missing jobs when the
 * server is asleep: Vercel (always up) wakes Render via this HTTP call.
 */
router.post('/trigger', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers['x-cron-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const tenantIds = await getActiveTenantIds();
    logger.info(`[CronTrigger] Daily trigger received — queuing content for ${tenantIds.length} tenant(s)`);

    const date = new Date().toISOString();
    await Promise.all(
      tenantIds.map((tenantId) =>
        enqueue(QUEUES.CONTENT, 'generate-daily-content', {
          tenantId,
          trigger: 'vercel-cron',
          date,
        }, { priority: PRIORITY.NORMAL }).catch((err) =>
          logger.error('[CronTrigger] Failed to enqueue for tenant', { tenantId, error: err.message })
        )
      )
    );

    res.json({ ok: true, tenants: tenantIds.length, date });
  } catch (err) {
    logger.error('[CronTrigger] Error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
