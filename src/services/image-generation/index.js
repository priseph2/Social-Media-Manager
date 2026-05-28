'use strict';

const { getSupabaseClient } = require('../database/supabase-client');
const Imagen4Adapter = require('./adapters/imagen4');
const GeminiImageAdapter = require('./adapters/gemini-image');
const DalleAdapter = require('./adapters/dalle');
const CanvaAdapter = require('./adapters/canva');
const logger = require('../../utils/logger');

// Provider key → adapter factory
const ADAPTERS = {
  'gemini-image':     () => new GeminiImageAdapter(),
  'imagen4-fast':     () => new Imagen4Adapter('imagen4-fast'),
  'imagen4-standard': () => new Imagen4Adapter('imagen4-standard'),
  'dalle3-standard':  () => new DalleAdapter('dalle3-standard'),
  'dalle3-hd':        () => new DalleAdapter('dalle3-hd'),
  'canva':            (tenantId) => new CanvaAdapter(tenantId),
};

// Auto-fallback order for when no provider is explicitly set.
// Excludes Canva — it needs per-tenant credentials.
// Google providers first (free + paid), then OpenAI.
const AUTO_FALLBACK_ORDER = [
  'gemini-image',
  'imagen4-fast', 'imagen4-standard',
  'dalle3-standard', 'dalle3-hd',
];

// Errors from generate() that indicate a quota/billing problem rather than a
// permanent configuration failure.  On these we skip to the next provider.
const QUOTA_PATTERNS = [
  /429/,
  /RESOURCE_EXHAUSTED/i,
  /credits.*depleted/i,
  /prepayment/i,
  /quota/i,
  /billing/i,
];

function isQuotaError(err) {
  return QUOTA_PATTERNS.some((p) => p.test(err.message));
}

// Returns true if the required API key for this provider is present in env.
function isProviderKeyConfigured(providerKey) {
  if (['gemini-image', 'imagen4-fast', 'imagen4-standard'].includes(providerKey)) {
    return !!process.env.GOOGLE_API_KEY;
  }
  if (['dalle3-standard', 'dalle3-hd'].includes(providerKey)) {
    return !!process.env.OPENAI_API_KEY;
  }
  if (providerKey === 'canva') return true;
  return false;
}

// Short-lived cache — don't hit Supabase on every image job
const _cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Wraps multiple adapters so quota/billing failures fall through to the next
 * one automatically.  Config failures and prompt-rejection errors are re-thrown
 * immediately since retrying won't help.
 */
class FallbackAdapter {
  constructor(adapters, labels) {
    this.adapters = adapters;
    this.labels = labels;
  }

  async generate(prompt, platform) {
    let lastError;
    for (let i = 0; i < this.adapters.length; i++) {
      const label = this.labels[i];
      try {
        const result = await this.adapters[i].generate(prompt, platform);
        if (i > 0) {
          logger.info(`[ImageGen] Succeeded with fallback provider '${label}'`);
        }
        return result;
      } catch (err) {
        if (isQuotaError(err)) {
          logger.warn(`[ImageGen] Provider '${label}' quota/billing error — trying next`, { error: err.message });
          lastError = err;
          continue;
        }
        throw err; // non-quota error is fatal
      }
    }
    throw lastError || new Error('All image providers failed');
  }
}

/**
 * Returns an adapter for the tenant.  If multiple providers have keys configured
 * (e.g. both GOOGLE_API_KEY and OPENAI_API_KEY), they are wrapped in a
 * FallbackAdapter so quota exhaustion on one automatically tries the next.
 *
 * Resolution order:
 *  1. Admin-configured provider → used directly (wrapped with remaining
 *     auto-fallback providers so quota failures still fall through)
 *  2. Auto-select through AUTO_FALLBACK_ORDER — all configured providers
 *     are chained; first success wins
 *  3. Canva — only when explicitly set by admin
 *  4. Nothing configured → actionable error
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
  // Build the ordered list of providers to try
  const chain = [];

  // 1. Admin-configured provider goes first (if its key is present)
  if (configuredProvider && ADAPTERS[configuredProvider]) {
    if (configuredProvider === 'canva') {
      logger.info(`[ImageGen] Using Canva provider (tenant credentials)`, { tenantId });
      return ADAPTERS['canva'](tenantId);
    }
    if (isProviderKeyConfigured(configuredProvider)) {
      chain.push(configuredProvider);
      logger.info(`[ImageGen] Primary provider: '${configuredProvider}'`, { tenantId });
    } else {
      logger.warn(
        `[ImageGen] Admin-configured provider '${configuredProvider}' has no API key — falling back`,
        { tenantId }
      );
    }
  }

  // 2. Append remaining auto-fallback providers that have keys (skip already added)
  for (const key of AUTO_FALLBACK_ORDER) {
    if (!chain.includes(key) && isProviderKeyConfigured(key)) {
      chain.push(key);
    }
  }

  if (chain.length === 0) {
    logger.error(
      '[ImageGen] No image generation provider configured. Set GOOGLE_API_KEY or OPENAI_API_KEY.',
      { tenantId }
    );
    return {
      async generate() {
        throw new Error(
          'No image generation provider is configured. ' +
          'Set GOOGLE_API_KEY (Gemini / Imagen 4) or OPENAI_API_KEY (DALL-E 3 / gpt-image-1).'
        );
      },
    };
  }

  if (chain.length === 1) {
    logger.info(`[ImageGen] Using provider '${chain[0]}'`, { tenantId });
    return ADAPTERS[chain[0]](tenantId);
  }

  logger.info(`[ImageGen] Provider chain: ${chain.join(' → ')}`, { tenantId });
  return new FallbackAdapter(
    chain.map((key) => ADAPTERS[key](tenantId)),
    chain
  );
}

function invalidateProviderCache(tenantId) {
  _cache.delete(tenantId);
}

module.exports = { getImageAdapter, invalidateProviderCache, VALID_PROVIDERS: Object.keys(ADAPTERS) };
