'use strict';

const { getSupabaseClient } = require('../database/supabase-client');
const Imagen4Adapter = require('./adapters/imagen4');
const DalleAdapter = require('./adapters/dalle');
const CanvaAdapter = require('./adapters/canva');
const logger = require('../../utils/logger');

// Provider key → adapter factory
const ADAPTERS = {
  'imagen4-fast':     (tenantId) => new Imagen4Adapter('imagen4-fast'),
  'imagen4-standard': (tenantId) => new Imagen4Adapter('imagen4-standard'),
  'dalle3-standard':  (tenantId) => new DalleAdapter('dalle3-standard'),
  'dalle3-hd':        (tenantId) => new DalleAdapter('dalle3-hd'),
  'canva':            (tenantId) => new CanvaAdapter(tenantId),
};

const DEFAULT_PROVIDER = 'imagen4-fast';

// Short-lived cache so we don't hit Supabase on every image job
const _cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Returns the image adapter configured for the given tenant.
 * Falls back to imagen4-fast if the tenant has no preference or an unknown one.
 */
async function getImageAdapter(tenantId) {
  if (!tenantId) return new Imagen4Adapter(DEFAULT_PROVIDER);

  const cached = _cache.get(tenantId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.adapter;
  }

  const db = getSupabaseClient();
  let providerKey = DEFAULT_PROVIDER;

  if (db) {
    const { data, error } = await db
      .from('tenants')
      .select('image_provider')
      .eq('id', tenantId)
      .maybeSingle();

    if (!error && data?.image_provider) {
      providerKey = data.image_provider;
    }
  }

  const factory = ADAPTERS[providerKey] ?? ADAPTERS[DEFAULT_PROVIDER];
  const adapter = factory(tenantId);

  _cache.set(tenantId, { adapter, at: Date.now() });
  return adapter;
}

function invalidateProviderCache(tenantId) {
  _cache.delete(tenantId);
}

module.exports = { getImageAdapter, invalidateProviderCache, VALID_PROVIDERS: Object.keys(ADAPTERS) };
