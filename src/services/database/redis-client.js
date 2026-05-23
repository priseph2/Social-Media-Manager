'use strict';

const Redis = require('ioredis');
const logger = require('../../utils/logger');

let client = null;

function getRedisClient() {
  if (client) return client;

  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn('REDIS_URL not set — queue and cache features are disabled.');
    return null;
  }

  client = new Redis(url, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    tls: url.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
    lazyConnect: true,
  });

  client.on('connect', () => logger.info('Redis connected'));
  client.on('error', (err) => logger.error('Redis error', { error: err }));

  return client;
}

async function closeRedis() {
  if (client) {
    await client.quit();
    client = null;
  }
}

module.exports = { getRedisClient, closeRedis };
