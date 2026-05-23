'use strict';

const { getSupabaseClient } = require('./database/supabase-client');
const logger = require('../utils/logger');
const DEFAULT_CONFIG = require('../config/brand-guidelines');

const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getBrandConfig(tenantId) {
  if (!tenantId) return DEFAULT_CONFIG;

  const cached = _cache.get(tenantId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  const supabase = getSupabaseClient();
  if (!supabase) return DEFAULT_CONFIG;

  const { data, error } = await supabase
    .from('brand_configs')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    logger.debug(`No brand config for tenant ${tenantId} — using defaults`);
    return DEFAULT_CONFIG;
  }

  _cache.set(tenantId, { config: data.config, cachedAt: Date.now() });
  return data.config;
}

async function setBrandConfig(tenantId, config) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not available');

  const { data: existing } = await supabase
    .from('brand_configs')
    .select('version')
    .eq('tenant_id', tenantId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (existing?.version ?? 0) + 1;

  await supabase
    .from('brand_configs')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId);

  const { error } = await supabase
    .from('brand_configs')
    .insert({
      tenant_id: tenantId,
      version: nextVersion,
      config: { ...config, version: String(nextVersion), updatedAt: new Date().toISOString().split('T')[0] },
      is_active: true,
    });

  if (error) throw error;
  _cache.delete(tenantId);
  return nextVersion;
}

function invalidateCache(tenantId) {
  _cache.delete(tenantId);
}

module.exports = { getBrandConfig, setBrandConfig, invalidateCache };
