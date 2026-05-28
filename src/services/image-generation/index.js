'use strict';

const { getSupabaseClient } = require('../database/supabase-client');
const Imagen4Adapter = require('./adapters/imagen4');
const GeminiImageAdapter = require('./adapters/gemini-image');
const DalleAdapter = require('./adapters/dalle');
const CanvaAdapter = require('./adapters/canva');
const logger = require('../../utils/logger');

// Provider key → adapter factory
const ADAPTERS = {
  'gemini-image':     () => new GeminiImageAdapter(),       // free Google AI Studio tier
  'imagen4-fast':     () => new Imagen4Adapter('imagen4-fast'),    // paid Google billing
  'imagen4-standard': () => new Imagen4Adapter('imagen4-standard'),
  'dalle3-standard':  () => new DalleAdapter('dalle3-standard'),
  'dalle3-hd':        () => new DalleAdapter('dalle3-hd'),
  'canva':            (tenantId) => new CanvaAdapter(tenantId),
};

// Auto-fallback order (excludes Canva — needs per-tenant credentials).
// gemini-image first: works on free Google AI Studio key.
// imagen4 variants next: require paid Google billing.
// dalle3 variants last: require OpenAI key.
const AUTO_FALLBACK_ORDER = [
  'gemini-image',
  'imagen4-fast', 'imagen4-standard',
  'dalle3-standard', 'dalle3-hd',
];

// Returns true if the required API key for this provider is present in env.
// Canva uses per-tenant credentials checked at generate() time.
function isProviderKeyConfigured(providerKey) {
  if (providerKey === 'gemini-image' || providerKey === 'imagen4-fast' || providerKey === 'imagen4-standard') {
    return !!process.env.GOOGLE_API_KEY;
  }
  if (providerKey === 'dalle3-standard' || providerKey === 'dalle3-hd') {
    return !!process.env.OPENAI_API_KEY;
  }
  if (providerKey === 'canva') return true;
  return false;
}

// Short-lived cache so we don't hit Supabase on every image job
const _cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Returns the image adapter for a tenant, respecting the admin-configured provider
 * and falling back gracefully when the required API key is not set.
 *
 * Resolution order:
 *  1. Tenant's admin-configured provider (if its key is present)
 *  2. Auto-fallback through AUTO_FALLBACK_ORDER — first provider with a key wins
 *  3. If nothing is configured, returns a placeholder that will throw a clear error
 */
async function getImageAdapter(tenantId) {
  if (!tenantId) return _resolveAdapter(null, null);

  const cached = _cache.get(tenantId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.adapter;
  }

  const db = getSupabaseClient();
  let configuredProvider = null;

  if (db) {
    const { data, error } = await db
      .from('tenants')
      .select('image_provider')
      .eq('id', tenantId)
      .maybeSingle();

    if (!error && data?.image_provider) {
      configuredProvider = data.image_provider;
    }
  }

  const adapter = _resolveAdapter(configuredProvider, tenantId);
  _cache.set(tenantId, { adapter, at: Date.now() });
  return adapter;
}

function _resolveAdapter(configuredProvider, tenantId) {
  // 1. Admin explicitly set a provider AND its key is configured → use it directly
  if (configuredProvider && ADAPTERS[configuredProvider]) {
    if (isProviderKeyConfigured(configuredProvider)) {
      logger.info(`[ImageGen] Using admin-configured provider '${configuredProvider}'`, { tenantId });
      return ADAPTERS[configuredProvider](tenantId);
    }
    // Admin set a provider but the key isn't available — warn and fall through
    logger.warn(
      `[ImageGen] Admin-configured provider '${configuredProvider}' has no API key set — falling back to auto-select`,
      { tenantId, hint: configuredProvider.startsWith('imagen4') ? 'Set GOOGLE_API_KEY' : 'Set OPENAI_API_KEY' }
    );
  }

  // 2. Auto-select: try each provider in priority order, pick first with a key
  for (const providerKey of AUTO_FALLBACK_ORDER) {
    if (isProviderKeyConfigured(providerKey)) {
      const reason = configuredProvider ? `fallback from '${configuredProvider}'` : 'auto-select';
      logger.info(`[ImageGen] Using provider '${providerKey}' (${reason})`, { tenantId });
      return ADAPTERS[providerKey](tenantId);
    }
  }

  // 3. Canva: only if explicitly configured (tenant credentials checked at generate() time)
  if (configuredProvider === 'canva') {
    logger.info(`[ImageGen] Using Canva provider (tenant credentials)`, { tenantId });
    return ADAPTERS['canva'](tenantId);
  }

  // 4. Nothing configured — return a no-op adapter that throws a clear, actionable error
  logger.error(
    '[ImageGen] No image generation provider configured. Set GOOGLE_API_KEY (Gemini/Imagen) or OPENAI_API_KEY (DALL-E 3).',
    { tenantId }
  );
  return {
    async generate() {
      throw new Error(
        'No image generation provider is configured. ' +
        'Set GOOGLE_API_KEY (for Gemini / Imagen 4) or OPENAI_API_KEY (for DALL-E 3) in your environment variables.'
      );
    },
  };
}

function invalidateProviderCache(tenantId) {
  _cache.delete(tenantId);
}

module.exports = { getImageAdapter, invalidateProviderCache, VALID_PROVIDERS: Object.keys(ADAPTERS) };
