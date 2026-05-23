'use strict';

const { getSupabaseClient } = require('../../services/database/supabase-client');
const logger = require('../../utils/logger');

/**
 * Authenticates requests and resolves tenant context.
 *
 * Accepts:
 * 1. Supabase JWT (dashboard users) — extracts tenant_id from app_metadata
 * 2. API_SECRET_KEY env var → DEFAULT_TENANT_ID (legacy / direct API access)
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header. Use: Bearer <token>' });
  }

  const token = authHeader.slice(7);

  // ── Legacy API key (single-tenant fallback) ──────────────────────────────
  if (process.env.API_SECRET_KEY && token === process.env.API_SECRET_KEY) {
    req.tenantId = process.env.DEFAULT_TENANT_ID || null;
    if (!req.tenantId) {
      logger.warn('API_SECRET_KEY auth used but DEFAULT_TENANT_ID not set — tenant context unavailable');
    }
    return next();
  }

  // ── Supabase JWT ──────────────────────────────────────────────────────────
  const supabase = getSupabaseClient();
  if (!supabase) {
    logger.warn('Supabase unavailable — falling back to open access (dev mode)');
    return next();
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.tenantId = user.app_metadata?.tenant_id || null;
    req.userId = user.id;
    req.userEmail = user.email;
    next();
  } catch (err) {
    logger.error('Auth token verification failed', { error: err.message });
    res.status(401).json({ error: 'Token verification failed' });
  }
}

module.exports = { authenticate };
