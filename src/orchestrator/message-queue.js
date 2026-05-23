'use strict';

const { Queue, Worker, QueueEvents } = require('bullmq');
const { getRedisClient } = require('../services/database/redis-client');
const logger = require('../utils/logger');
const { QUEUES, PRIORITY } = require('../config/constants');

const queues = {};
const workers = {};
const queueEvents = {};

function getConnection() {
  const redis = getRedisClient();
  if (!redis) return null;
  // BullMQ needs the raw ioredis instance config, not the client itself
  return { connection: redis };
}

/**
 * Returns (or creates) a named BullMQ Queue.
 */
function getQueue(queueName) {
  if (!queues[queueName]) {
    const conn = getConnection();
    if (!conn) {
      logger.warn(`Queue "${queueName}" unavailable — Redis not configured`);
      return null;
    }
    queues[queueName] = new Queue(queueName, conn);
    logger.debug(`Queue "${queueName}" initialised`);
  }
  return queues[queueName];
}

/**
 * Adds a job to a named queue.
 */
async function enqueue(queueName, jobName, data, opts = {}) {
  const queue = getQueue(queueName);
  if (!queue) {
    logger.warn(`Dropping job "${jobName}" — queue "${queueName}" not available`);
    return null;
  }

  const job = await queue.add(jobName, data, {
    priority: opts.priority || PRIORITY.NORMAL,
    attempts: opts.attempts || 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
    ...opts,
  });

  logger.info(`Job enqueued: ${jobName} (${job.id}) → ${queueName}`, { jobId: job.id, priority: opts.priority });
  return job;
}

/**
 * Registers a skill as a BullMQ worker for a queue.
 * @param {string}   queueName
 * @param {BaseSkill} skill
 */
function registerWorker(queueName, skill) {
  const conn = getConnection();
  if (!conn) {
    logger.warn(`Worker for "${queueName}" not started — Redis unavailable`);
    return null;
  }

  if (workers[queueName]) return workers[queueName];

  const worker = new Worker(
    queueName,
    async (job) => skill.process(job),
    { ...conn, concurrency: 3 }
  );

  worker.on('completed', (job, result) =>
    logger.info(`Worker: job ${job.id} completed on ${queueName}`, { jobId: job.id })
  );
  worker.on('failed', (job, err) =>
    logger.error(`Worker: job ${job?.id} failed on ${queueName}`, { jobId: job?.id, error: err })
  );

  workers[queueName] = worker;
  logger.info(`Worker registered for queue: ${queueName}`);
  return worker;
}

async function closeAllQueues() {
  await Promise.all([
    ...Object.values(queues).map((q) => q.close()),
    ...Object.values(workers).map((w) => w.close()),
  ]);
}

module.exports = { getQueue, enqueue, registerWorker, closeAllQueues };
