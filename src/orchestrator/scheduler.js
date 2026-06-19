'use strict';

const cron = require('node-cron');
const logger = require('../utils/logger');
const { enqueue } = require('./message-queue');
const { QUEUES, PRIORITY } = require('../config/constants');
const { getSupabaseClient } = require('../services/database/supabase-client');
const { notify } = require('../services/notifications');

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
    .not('status', 'eq', 'suspended');
  return (data || []).map((t) => t.id);
}

function initScheduler() {
  // 8:00 PM GMT daily — daily content creation for each active tenant
  schedule('0 20 * * *', 'daily-content-creation', async () => {
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

  // 5:00 PM UTC daily (= 6:00 PM WAT) — analytics aggregation for each active tenant
  schedule('0 17 * * *', 'daily-analytics', async () => {
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

  // Sunday 5:00 PM UTC (= 6:00 PM WAT) — weekly newsletter for each active tenant
  schedule('0 17 * * 0', 'weekly-newsletter', async () => {
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

  // Daily midnight — health check + trial expiry notifications
  schedule('0 0 * * *', 'daily-health-check', async () => {
    logger.info('[Scheduler] Daily health check OK');
    await _checkTrialExpiry();
  });

  logger.info(`Scheduler initialised with ${scheduledJobs.length} recurring jobs`);
}

async function _checkTrialExpiry() {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const now = new Date();
  const in2Days = new Date(now.getTime() + 2 * 86400000).toISOString();
  const in3Days = new Date(now.getTime() + 3 * 86400000).toISOString();
  const yesterday = new Date(now.getTime() - 86400000).toISOString();

  // Trials expiring in the next 2–3 days — send a "ending soon" warning once
  const { data: expiring } = await supabase
    .from('subscriptions')
    .select('tenant_id, trial_ends_at')
    .eq('status', 'trialing')
    .gte('trial_ends_at', in2Days)
    .lte('trial_ends_at', in3Days);

  for (const sub of expiring || []) {
    const expiryDate = new Date(sub.trial_ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    await notify(sub.tenant_id, {
      type: 'trial_expiring',
      title: 'Your free trial ends in 3 days',
      body: `Your trial expires on ${expiryDate}. Upgrade now to keep all AI features running without interruption.`,
      link: '/dashboard/settings/billing',
    });
  }

  // Trials that expired in the last 24 hours — send a "trial ended" notice
  const { data: expired } = await supabase
    .from('subscriptions')
    .select('tenant_id, trial_ends_at')
    .eq('status', 'trialing')
    .gte('trial_ends_at', yesterday)
    .lte('trial_ends_at', now.toISOString());

  for (const sub of expired || []) {
    await notify(sub.tenant_id, {
      type: 'trial_expired',
      title: 'Your free trial has ended',
      body: 'Your trial period has ended and AI features have been paused. Upgrade to a paid plan to resume publishing, scheduling, and AI-generated content.',
      link: '/dashboard/settings/billing',
    });
  }

  if ((expiring?.length || 0) + (expired?.length || 0) > 0) {
    logger.info(`[Scheduler] Trial expiry notifications sent: ${expiring?.length || 0} expiring, ${expired?.length || 0} expired`);
  }
}

function schedule(cronExpr, name, fn) {
  const task = cron.schedule(cronExpr, fn);
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
