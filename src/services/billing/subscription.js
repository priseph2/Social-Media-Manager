'use strict';

const { getSupabaseClient } = require('../database/supabase-client');
const { getPlan, isFeatureEnabled, hasUnlimitedOps } = require('../../config/plans');
const { getMonthlyUsage } = require('./usage-meter');
const logger = require('../../utils/logger');

// 5-minute in-memory cache keyed by tenantId
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

// ── Internal helpers ────────────────────────────────────────────────────────

function _cached(tenantId, value) {
  _cache.set(tenantId, { value, cachedAt: Date.now() });
  return value;
}

function _fromCache(tenantId) {
  const entry = _cache.get(tenantId);
  if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) return entry.value;
  return null;
}

function invalidateCache(tenantId) {
  _cache.delete(tenantId);
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the subscription row for a tenant.
 * Creates a default starter record if none exists.
 */
async function getSubscription(tenantId) {
  if (!tenantId) return _defaultSubscription();

  const cached = _fromCache(tenantId);
  if (cached) return cached;

  const supabase = getSupabaseClient();
  if (!supabase) return _defaultSubscription();

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    logger.warn('getSubscription DB error', { tenantId, error: error.message });
    return _defaultSubscription();
  }

  // Row was auto-created by the DB trigger; if somehow missing, create now
  if (!data) {
    const sub = await _ensureSubscription(tenantId, supabase);
    return _cached(tenantId, sub);
  }

  return _cached(tenantId, data);
}

/**
 * Returns the effective plan id, accounting for trial expiry and cancellation.
 */
async function getEffectivePlan(tenantId) {
  const sub = await getSubscription(tenantId);

  // Permanent free plan — never expires
  if (sub.status === 'free') return 'free';

  // Trial: if trial_ends_at is null or has passed, drop to free
  if (sub.status === 'trialing') {
    if (!sub.trial_ends_at || new Date(sub.trial_ends_at) < new Date()) return 'free';
  }

  // Cancelled subscription → free
  if (sub.status === 'cancelled') return 'free';

  // Active but billing period ended (7-day grace period for delayed webhooks)
  if (sub.status === 'active' && sub.current_period_end) {
    const gracePeriodMs = 7 * 24 * 60 * 60 * 1000;
    if (new Date(sub.current_period_end) < new Date(Date.now() - gracePeriodMs)) return 'free';
  }

  return sub.plan || 'free';
}

/**
 * Checks whether a feature is enabled for the tenant's current plan.
 */
async function checkFeature(tenantId, feature) {
  const plan = await getEffectivePlan(tenantId);
  return isFeatureEnabled(plan, feature);
}

/**
 * Returns remaining AI operations for the current billing period.
 * Returns Infinity if the plan has unlimited ops.
 */
async function getRemainingOps(tenantId) {
  const plan = await getEffectivePlan(tenantId);
  if (hasUnlimitedOps(plan)) return Infinity;

  const { monthlyAiOps } = getPlan(plan).limits;
  const { totalOps } = await getMonthlyUsage(tenantId);
  return Math.max(0, monthlyAiOps - totalOps);
}

/**
 * Checks if the tenant has remaining AI operations.
 */
async function hasOpsRemaining(tenantId) {
  const remaining = await getRemainingOps(tenantId);
  return remaining > 0;
}

/**
 * Returns detailed ops usage status — remaining, limit, and percent used.
 */
async function getOpsStatus(tenantId) {
  const plan = await getEffectivePlan(tenantId);
  if (hasUnlimitedOps(plan)) {
    return { remaining: Infinity, limit: null, percentUsed: 0, unlimited: true };
  }
  const { monthlyAiOps: limit } = getPlan(plan).limits;
  const { totalOps } = await getMonthlyUsage(tenantId);
  const remaining = Math.max(0, limit - totalOps);
  const percentUsed = limit > 0 ? Math.round((totalOps / limit) * 100) : 0;
  return { remaining, limit, percentUsed, unlimited: false };
}

// ── Subscription mutations ──────────────────────────────────────────────────

/**
 * Upserts a subscription record.
 * Called after a successful Paystack payment or subscription webhook.
 */
async function upsertSubscription(tenantId, fields) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not available');

  const { error } = await supabase
    .from('subscriptions')
    .upsert({ tenant_id: tenantId, ...fields, updated_at: new Date().toISOString() }, {
      onConflict: 'tenant_id',
    });

  if (error) throw error;

  // Also sync the plan column on the tenants table
  if (fields.plan) {
    await supabase
      .from('tenants')
      .update({ plan: fields.plan, updated_at: new Date().toISOString() })
      .eq('id', tenantId);
  }

  invalidateCache(tenantId);
  logger.info('Subscription upserted', { tenantId, plan: fields.plan, status: fields.status });
}

/**
 * Schedules a plan change for the next billing cycle.
 */
async function schedulePlanChange(tenantId, newPlan) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not available');
  await supabase
    .from('subscriptions')
    .update({ pending_plan: newPlan, cancel_at_period_end: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId);
  invalidateCache(tenantId);
}

/**
 * Cancels the subscription at the end of the current billing period.
 */
async function cancelAtPeriodEnd(tenantId) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not available');
  await supabase
    .from('subscriptions')
    .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId);
  invalidateCache(tenantId);
}

/**
 * Appends a billing event to the audit log.
 */
async function logBillingEvent(tenantId, eventType, payload = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.from('billing_events').insert({ tenant_id: tenantId, event_type: eventType, payload });
}

// ── Privates ────────────────────────────────────────────────────────────────

function _defaultSubscription() {
  return { plan: 'free', status: 'free' };
}

async function _ensureSubscription(tenantId, supabase) {
  await supabase.from('subscriptions').insert({
    tenant_id: tenantId,
    plan: 'free',
    status: 'free',
  }).onConflict('tenant_id').ignore();

  const { data } = await supabase
    .from('subscriptions').select('*').eq('tenant_id', tenantId).maybeSingle();
  return data || _defaultSubscription();
}

module.exports = {
  getSubscription,
  getEffectivePlan,
  checkFeature,
  getRemainingOps,
  hasOpsRemaining,
  getOpsStatus,
  upsertSubscription,
  schedulePlanChange,
  cancelAtPeriodEnd,
  logBillingEvent,
  invalidateCache,
};
