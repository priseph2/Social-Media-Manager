'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const { getSupabaseClient } = require('../database/supabase-client');
const { estimateCost } = require('../../config/plans');
const logger = require('../../utils/logger');

/**
 * AsyncLocalStorage instance shared across the application.
 *
 * Stores: { tenantId: string | null, skill: string | null }
 *
 * Set by:
 *  - base-skill.js → wraps every job execution
 *  - tenant-context middleware → wraps every HTTP request
 *
 * Read by:
 *  - anthropic-client.js → after every Claude API call
 */
const tenantStorage = new AsyncLocalStorage();

// Write batching: buffer records for up to 5 seconds before flushing
const _buffer = [];
let _flushTimer = null;
let _flushing = false; // Prevents concurrent flush() invocations
const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 5000; // Prevent OOM during sustained Supabase outages

/**
 * Records usage from one Claude API call.
 * Fire-and-forget — errors are logged but never bubble up.
 *
 * @param {string} tenantId
 * @param {string} model
 * @param {object} usage  — { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }
 * @param {string} skill  — skill name for attribution
 */
function recordUsage(tenantId, model, usage, skill = null) {
  if (!tenantId) {
    logger.warn('recordUsage called with no tenantId — skipping', { model, skill });
    return;
  }
  if (_buffer.length >= MAX_BUFFER_SIZE) {
    logger.warn('Usage meter buffer at capacity — dropping record', { tenantId, model });
    return;
  }

  const billingPeriod = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const costUsd = estimateCost(
    model,
    usage.input_tokens || 0,
    usage.output_tokens || 0,
    usage.cache_read_input_tokens || 0,
    usage.cache_creation_input_tokens || 0
  );

  _buffer.push({
    tenant_id: tenantId,
    billing_period: billingPeriod,
    skill,
    model,
    input_tokens: usage.input_tokens || 0,
    output_tokens: usage.output_tokens || 0,
    cache_read_tokens: usage.cache_read_input_tokens || 0,
    cache_write_tokens: usage.cache_creation_input_tokens || 0,
    cost_usd: costUsd,
    ops_count: 1,
  });

  // Schedule a flush
  if (!_flushTimer) {
    _flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
  }
}

async function flush() {
  _flushTimer = null;
  if (_flushing || !_buffer.length) return;

  const supabase = getSupabaseClient();
  if (!supabase) return;

  _flushing = true;
  const rows = _buffer.splice(0, _buffer.length);

  try {
    const { error } = await supabase.from('usage_records').insert(rows);
    if (error) {
      // Restore rows for retry, but cap the buffer to prevent OOM
      const capacity = MAX_BUFFER_SIZE - _buffer.length;
      const toRestore = rows.slice(0, Math.max(0, capacity));
      if (toRestore.length) _buffer.unshift(...toRestore);
      const dropped = rows.length - toRestore.length;
      logger.warn('Usage meter flush error — rows restored for retry', { error: error.message, restored: toRestore.length, dropped });
    } else {
      logger.info(`Usage meter: flushed ${rows.length} record(s) to Supabase`);
    }
  } catch (err) {
    const capacity = MAX_BUFFER_SIZE - _buffer.length;
    const toRestore = rows.slice(0, Math.max(0, capacity));
    if (toRestore.length) _buffer.unshift(...toRestore);
    const dropped = rows.length - toRestore.length;
    logger.warn('Usage meter flush exception — rows restored for retry', { error: err.message, restored: toRestore.length, dropped });
  } finally {
    _flushing = false;
    // Schedule another flush if records accumulated while we were flushing
    if (_buffer.length && !_flushTimer) {
      _flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
    }
  }
}

/**
 * Returns aggregated usage for a tenant in the given billing period.
 * billingPeriod defaults to the current month ('YYYY-MM').
 */
async function getMonthlyUsage(tenantId, billingPeriod = null) {
  const period = billingPeriod || new Date().toISOString().slice(0, 7);
  const supabase = getSupabaseClient();
  if (!supabase || !tenantId) return { totalOps: 0, totalCostUsd: 0, billingPeriod: period };

  const { data, error } = await supabase
    .from('monthly_usage')
    .select('total_ops, total_cost_usd, total_input_tokens, total_output_tokens')
    .eq('tenant_id', tenantId)
    .eq('billing_period', period)
    .maybeSingle();

  if (error || !data) return { totalOps: 0, totalCostUsd: 0, billingPeriod: period };

  return {
    totalOps: Number(data.total_ops || 0),
    totalCostUsd: Number(data.total_cost_usd || 0),
    totalInputTokens: Number(data.total_input_tokens || 0),
    totalOutputTokens: Number(data.total_output_tokens || 0),
    billingPeriod: period,
  };
}

/**
 * Returns per-skill breakdown for the current billing period.
 */
async function getSkillBreakdown(tenantId, billingPeriod = null) {
  const period = billingPeriod || new Date().toISOString().slice(0, 7);
  const supabase = getSupabaseClient();
  if (!supabase || !tenantId) return [];

  const { data, error } = await supabase
    .from('usage_records')
    .select('skill, model, input_tokens, output_tokens, cost_usd, ops_count')
    .eq('tenant_id', tenantId)
    .eq('billing_period', period)
    .order('cost_usd', { ascending: false });

  if (error || !data) return [];

  // Group by skill
  const grouped = {};
  for (const row of data) {
    const key = row.skill || 'unknown';
    if (!grouped[key]) grouped[key] = { skill: key, ops: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };
    grouped[key].ops += row.ops_count || 0;
    grouped[key].costUsd += Number(row.cost_usd || 0);
    grouped[key].inputTokens += row.input_tokens || 0;
    grouped[key].outputTokens += row.output_tokens || 0;
  }
  return Object.values(grouped).sort((a, b) => b.costUsd - a.costUsd);
}

/**
 * Records one image generation call.
 * Uses the same usage_records table, with ops_count=0 and image_count=1
 * so AI ops quotas and image quotas are tracked independently.
 *
 * @param {string} tenantId
 * @param {string} provider  - e.g. 'imagen4-fast', 'dalle3-standard', 'canva'
 * @param {number} costUsd   - actual per-image cost from IMAGE_PROVIDER_PRICING
 * @param {string} skill     - skill name for attribution
 */
function recordImageUsage(tenantId, provider, costUsd = 0, skill = 'visual-designer') {
  if (!tenantId) {
    logger.warn('recordImageUsage called with no tenantId — skipping', { provider, skill });
    return;
  }
  if (_buffer.length >= MAX_BUFFER_SIZE) {
    logger.warn('Usage meter buffer at capacity — dropping image record', { tenantId, provider });
    return;
  }

  const billingPeriod = new Date().toISOString().slice(0, 7);
  _buffer.push({
    tenant_id: tenantId,
    billing_period: billingPeriod,
    skill,
    model: provider,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost_usd: costUsd,
    ops_count: 0,
    image_count: 1,
    image_cost_usd: costUsd,
  });

  if (!_flushTimer) {
    _flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
  }
}

/**
 * Returns image generation usage totals for a tenant in the current billing period.
 */
async function getMonthlyImageUsage(tenantId, billingPeriod = null) {
  const period = billingPeriod || new Date().toISOString().slice(0, 7);
  const supabase = getSupabaseClient();
  if (!supabase || !tenantId) return { totalImages: 0, totalImageCostUsd: 0, billingPeriod: period };

  const { data, error } = await supabase
    .from('usage_records')
    .select('image_count, image_cost_usd')
    .eq('tenant_id', tenantId)
    .eq('billing_period', period)
    .gt('image_count', 0);

  if (error || !data) return { totalImages: 0, totalImageCostUsd: 0, billingPeriod: period };

  return {
    totalImages: data.reduce((sum, r) => sum + (r.image_count || 0), 0),
    totalImageCostUsd: parseFloat(data.reduce((sum, r) => sum + (r.image_cost_usd || 0), 0).toFixed(6)),
    billingPeriod: period,
  };
}

module.exports = { tenantStorage, recordUsage, recordImageUsage, flush, getMonthlyUsage, getSkillBreakdown, getMonthlyImageUsage };
