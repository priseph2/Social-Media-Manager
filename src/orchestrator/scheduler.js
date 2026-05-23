'use strict';

const cron = require('node-cron');
const logger = require('../utils/logger');
const { enqueue } = require('./message-queue');
const { QUEUES, PRIORITY } = require('../config/constants');

const scheduledJobs = [];

/**
 * Registers all recurring system tasks.
 * Times are in WAT (UTC+1) — the server should be configured accordingly.
 */
function initScheduler() {
  // 8:00 AM daily — trigger content creation for the day
  schedule('0 8 * * *', 'daily-content-creation', async () => {
    logger.info('[Scheduler] Daily content creation triggered');
    await enqueue(QUEUES.CONTENT, 'generate-daily-content', {
      trigger: 'scheduled',
      date: new Date().toISOString(),
    }, { priority: PRIORITY.NORMAL });
  });

  // 6:00 PM daily — analytics aggregation
  schedule('0 18 * * *', 'daily-analytics', async () => {
    logger.info('[Scheduler] Daily analytics aggregation triggered');
    await enqueue(QUEUES.ANALYTICS, 'aggregate-daily-metrics', {
      date: new Date().toISOString(),
    }, { priority: PRIORITY.LOW });
  });

  // Sunday 6:00 PM — weekly newsletter creation
  schedule('0 18 * * 0', 'weekly-newsletter', async () => {
    logger.info('[Scheduler] Weekly newsletter creation triggered');
    await enqueue(QUEUES.EMAIL, 'create-weekly-newsletter', {
      trigger: 'scheduled',
      date: new Date().toISOString(),
    }, { priority: PRIORITY.NORMAL });
  });

  // Every day at midnight — health check
  schedule('0 0 * * *', 'daily-health-check', async () => {
    logger.info('[Scheduler] Daily health check');
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
