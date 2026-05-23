'use strict';

const { getSupabaseClient } = require('./database/supabase-client');
const logger = require('../utils/logger');

const _cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

async function getCredentials(tenantId, service) {
  if (!tenantId) return null;

  const cacheKey = `${tenantId}:${service}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('tenant_credentials')
    .select('credentials, platform_type')
    .eq('tenant_id', tenantId)
    .eq('service', service)
    .maybeSingle();

  if (error || !data) return null;

  _cache.set(cacheKey, {
    value: { ...data.credentials, _platformType: data.platform_type },
    cachedAt: Date.now(),
  });
  return _cache.get(cacheKey).value;
}

async function setCredentials(tenantId, service, credentials, platformType = null) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not available');

  const { error } = await supabase
    .from('tenant_credentials')
    .upsert(
      {
        tenant_id: tenantId,
        service,
        credentials,
        platform_type: platformType,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,service' }
    );

  if (error) throw error;
  _cache.delete(`${tenantId}:${service}`);
  logger.info(`Credentials updated for tenant ${tenantId} service ${service}`);
}

function invalidateCredentialCache(tenantId, service) {
  _cache.delete(`${tenantId}:${service}`);
}

module.exports = { getCredentials, setCredentials, invalidateCredentialCache };
