'use strict';

const { getRedisClient } = require('./database/redis-client');
const { supabaseQuery } = require('./database/supabase-client');
const logger = require('../utils/logger');
const { RATE_LIMITS } = require('../config/constants');

const WINDOW_MS = 3600 * 1000; // 1 hour sliding window
const PLAN_CACHE_TTL_MS = 5 * 60 * 1000; // cache plan lookups for 5 minutes

const planCache = new Map(); // tenantId → { plan, expires }

async function _getTenantPlan(tenantId) {
  const cached = planCache.get(tenantId);
  if (cached && cached.expires > Date.now()) return cached.plan;

  try {
    const row = await supabaseQuery((db) =>
      db.from('tenants').select('plan').eq('id', tenantId).single()
    );
    const plan = row?.plan || 'default';
    planCache.set(tenantId, { plan, expires: Date.now() + PLAN_CACHE_TTL_MS });
    return plan;
  } catch {
    return 'default';
  }
}

/**
 * Check and increment the per-tenant sliding window counter.
 *
 * Returns { allowed: true } or { allowed: false, count, limit, plan }.
 * Fails open (returns allowed: true) if Redis is unavailable.
 */
async function checkTenantRateLimit(tenantId) {
  const redis = getRedisClient();
  if (!redis || !tenantId) return { allowed: true };

  const plan = await _getTenantPlan(tenantId);
  const limit = RATE_LIMITS[plan] ?? RATE_LIMITS.default;
  const key = `rate:tenant:${tenantId}`;
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  try {
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, '-inf', windowStart);
    pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`);
    pipeline.zcard(key);
    pipeline.expire(key, 3700); // slightly over 1 hour for safety

    const results = await pipeline.exec();
    const count = results[2][1];

    if (count > limit) {
      logger.warn(`[RateLimiter] Tenant ${tenantId} exceeded hourly limit`, { count, limit, plan });
      return { allowed: false, count, limit, plan };
    }
    return { allowed: true, count, limit, plan };
  } catch (err) {
    logger.warn('[RateLimiter] Redis error — failing open', { error: err.message });
    return { allowed: true };
  }
}

/**
 * Returns current usage for a tenant within the rolling hour.
 */
async function getTenantHourlyUsage(tenantId) {
  const redis = getRedisClient();
  if (!redis || !tenantId) return { count: 0, limit: RATE_LIMITS.default };

  const plan = await _getTenantPlan(tenantId);
  const limit = RATE_LIMITS[plan] ?? RATE_LIMITS.default;
  const key = `rate:tenant:${tenantId}`;
  const windowStart = Date.now() - WINDOW_MS;

  try {
    await redis.zremrangebyscore(key, '-inf', windowStart);
    const count = await redis.zcard(key);
    return { count, limit, plan };
  } catch {
    return { count: 0, limit, plan };
  }
}

module.exports = { checkTenantRateLimit, getTenantHourlyUsage };
