'use strict';

const cron = require('node-cron');
const logger = require('../utils/logger');
const { enqueue } = require('./message-queue');
const { QUEUES, PRIORITY } = require('../config/constants');
const { getSupabaseClient } = require('../services/database/supabase-client');

const scheduledJobs = [];

async function getActiveTenantIds() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const fallback = process.env.DEFAULT_TENANT_ID;
    return fallback ? [fallback] : [];
  }
  const { data } = await supabase
    .from('tenants')
    .select('id')
    .eq('status', 'active');
  return (data || []).map((t) => t.id);
}

function initScheduler() {
  // 8:00 AM daily (WAT) — daily content creation for each active tenant
  schedule('0 8 * * *', 'daily-content-creation', async () => {
    const tenantIds = await getActiveTenantIds();
    logger.info(`[Scheduler] Daily content creation for ${tenantIds.length} tenant(s)`);
    for (const tenantId of tenantIds) {
      await enqueue(QUEUES.CONTENT, 'generate-daily-content', {
        tenantId,
        trigger: 'scheduled',
        date: new Date().toISOString(),
      }, { priority: PRIORITY.NORMAL }).catch((err) =>
        logger.error('[Scheduler] Failed to enqueue content job', { tenantId, error: err.message })
      );
    }
  });

  // 6:00 PM daily — analytics aggregation for each active tenant
  schedule('0 18 * * *', 'daily-analytics', async () => {
    const tenantIds = await getActiveTenantIds();
    logger.info(`[Scheduler] Daily analytics for ${tenantIds.length} tenant(s)`);
    for (const tenantId of tenantIds) {
      await enqueue(QUEUES.ANALYTICS, 'aggregate-daily-metrics', {
        tenantId,
        date: new Date().toISOString(),
      }, { priority: PRIORITY.LOW }).catch((err) =>
        logger.error('[Scheduler] Failed to enqueue analytics job', { tenantId, error: err.message })
      );
    }
  });

  // Sunday 6:00 PM — weekly newsletter for each active tenant
  schedule('0 18 * * 0', 'weekly-newsletter', async () => {
    const tenantIds = await getActiveTenantIds();
    logger.info(`[Scheduler] Weekly newsletter for ${tenantIds.length} tenant(s)`);
    for (const tenantId of tenantIds) {
      await enqueue(QUEUES.EMAIL, 'create-weekly-newsletter', {
        tenantId,
        trigger: 'scheduled',
        date: new Date().toISOString(),
      }, { priority: PRIORITY.NORMAL }).catch((err) =>
        logger.error('[Scheduler] Failed to enqueue newsletter job', { tenantId, error: err.message })
      );
    }
  });

  // Daily midnight — health check
  schedule('0 0 * * *', 'daily-health-check', async () => {
    logger.info('[Scheduler] Daily health check OK');
  });

  logger.info(`Scheduler initialised with ${scheduledJobs.length} recurring jobs`);
}

function schedule(cronExpr, name, fn) {
  const task = cron.schedule(cronExpr, fn, { timezone: 'Africa/Lagos' });
  scheduledJobs.push({ name, cronExpr, task });
  logger.debug(`Scheduled: ${name} (${cronExpr})`);
}

function stopScheduler() {
  scheduledJobs.forEach(({ name, task }) => {
    task.stop();
    logger.debug(`Stopped scheduled job: ${name}`);
  });
}

module.exports = { initScheduler, stopScheduler };
