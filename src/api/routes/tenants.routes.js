'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getSupabaseClient } = require('../../services/database/supabase-client');
const { setBrandConfig, getBrandConfig } = require('../../services/brand-config');
const { setCredentials } = require('../../services/credential-store');
const { sendWelcomeEmail } = require('../../services/transactional-email');
const { validateSignup, decrementDomainCounter } = require('../../services/abuse-prevention');
const logger = require('../../utils/logger');

const router = express.Router();
router.use(authenticate);

const ALLOWED_CREDENTIAL_SERVICES = new Set([
  'ecommerce', 'twitter', 'instagram', 'facebook', 'linkedin',
  'ga4', 'mailchimp', 'whatsapp', 'tidio', 'buffer', 'shopify', 'canva',
]);
const SLUG_MAX_LENGTH = 63;

// POST /api/tenants/setup — create tenant + assign to user
router.post('/setup', async (req, res, next) => {
  try {
    const { name, slug } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'name and slug are required' });
    if (!req.userId) return res.status(400).json({ error: 'User identity unavailable — cannot create tenant' });

    const supabase = getSupabaseClient();
    if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

    // Prevent duplicate tenant creation for the same user
    if (req.tenantId) {
      return res.status(409).json({ error: 'Account already has a tenant. Contact support to manage multiple tenants.' });
    }

    // Abuse prevention: disposable email / IP throttle / domain uniqueness
    if (req.userEmail) {
      const forwarded = req.headers['x-forwarded-for'];
      const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) || req.ip;
      const abuse = await validateSignup({ email: req.userEmail, ip });
      if (!abuse.allowed) {
        return res.status(429).json({ error: abuse.reason });
      }
    }

    const sanitisedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, SLUG_MAX_LENGTH);
    if (sanitisedSlug.length < 3) return res.status(400).json({ error: 'Slug must be at least 3 characters' });

    // Create tenant
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .insert({ name: String(name).slice(0, 200), slug: sanitisedSlug, plan: 'free', status: 'onboarding' })
      .select()
      .single();

    if (tenantErr) {
      // Roll back domain counter so a DB error doesn't permanently block legitimate users
      if (req.userEmail) decrementDomainCounter(req.userEmail).catch(() => {});
      if (tenantErr.code === '23505') return res.status(409).json({ error: 'Slug already taken' });
      throw tenantErr;
    }

    // Assign tenant to user via Supabase admin API
    const { error: updateErr } = await supabase.auth.admin.updateUserById(req.userId, {
      app_metadata: { tenant_id: tenant.id },
    });
    if (updateErr) {
      logger.warn('Failed to set tenant_id on user metadata', { error: updateErr });
    }

    res.status(201).json({ tenantId: tenant.id, slug: tenant.slug });
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/me — get current tenant
router.get('/me', async (req, res, next) => {
  try {
    if (!req.tenantId) return res.status(404).json({ error: 'No tenant context' });
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', req.tenantId)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Tenant not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/tenants/me/brand-config — save brand config
router.put('/me/brand-config', async (req, res, next) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'No tenant context' });
    const version = await setBrandConfig(req.tenantId, req.body);
    res.json({ version });
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/me/brand-config
router.get('/me/brand-config', async (req, res, next) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'No tenant context' });
    const { getBrandConfig } = require('../../services/brand-config');
    const config = await getBrandConfig(req.tenantId);
    res.json(config);
  } catch (err) {
    next(err);
  }
});

// PUT /api/tenants/me/credentials/:service — save integration credentials
router.put('/me/credentials/:service', async (req, res, next) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'No tenant context' });
    const { service } = req.params;
    if (!ALLOWED_CREDENTIAL_SERVICES.has(service)) {
      return res.status(400).json({ error: `Unknown service: ${service}` });
    }
    const { credentials, platformType } = req.body;
    if (!credentials) return res.status(400).json({ error: 'credentials required' });
    await setCredentials(req.tenantId, service, credentials, platformType);

    // Record platform connection
    const supabase = getSupabaseClient();
    await supabase.from('platform_connections').upsert({
      tenant_id: req.tenantId,
      platform: service,
      status: 'connected',
      metadata: { platformType },
      connected_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,platform' }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/me/connections — list connected platforms
router.get('/me/connections', async (req, res, next) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'No tenant context' });
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('platform_connections')
      .select('platform, status, connected_at, metadata')
      .eq('tenant_id', req.tenantId);
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// PUT /api/tenants/me/onboarding/:step — mark onboarding step complete
// Canonical names plus frontend aliases (brand_voice → voice, integrations → platforms)
const STEP_ALIASES = { brand_voice: 'voice', integrations: 'platforms' };
const VALID_ONBOARDING_STEPS = new Set(['company', 'voice', 'brand_voice', 'audience', 'platforms', 'integrations', 'launch']);

router.put('/me/onboarding/:step', async (req, res, next) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'No tenant context' });
    const rawStep = req.params.step;
    if (!VALID_ONBOARDING_STEPS.has(rawStep)) {
      return res.status(400).json({ error: `Invalid onboarding step: ${rawStep}` });
    }
    const step = STEP_ALIASES[rawStep] || rawStep;
    const supabase = getSupabaseClient();
    // Allowlist known safe onboarding fields per step
    const STEP_FIELDS = {
      company: ['name', 'tagline', 'industry', 'market', 'website', 'logoUrl'],
      voice: ['tone', 'doList', 'dontList', 'vocabulary'],
      audience: ['primary', 'secondary', 'demographics'],
      platforms: ['selected'],
      launch: [],
    };
    const allowed = STEP_FIELDS[step] || [];
    const safeData = allowed.length
      ? Object.fromEntries(allowed.filter((k) => k in req.body).map((k) => [k, req.body[k]]))
      : {};
    await supabase.from('onboarding_progress').upsert({
      tenant_id: req.tenantId,
      step,
      completed: true,
      data: safeData,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,step' });

    // Merge relevant onboarding data into brand_config so it's available immediately
    if (step === 'company' && (safeData.website || safeData.logoUrl)) {
      try {
        const existing = await getBrandConfig(req.tenantId);
        const merged = { ...existing, identity: { ...existing.identity } };
        if (safeData.website)  merged.identity.website  = safeData.website;
        if (safeData.logoUrl)  merged.identity.logoUrl  = safeData.logoUrl;
        await setBrandConfig(req.tenantId, merged);
      } catch (e) { logger.warn('Failed to merge company data into brand config', { error: e.message }); }
    }

    if (step === 'audience' && (safeData.primary || safeData.secondary)) {
      try {
        const existing = await getBrandConfig(req.tenantId);
        const merged = { ...existing, audience: { ...existing.audience } };
        if (safeData.primary)   merged.audience.primary   = safeData.primary;
        if (safeData.secondary) merged.audience.secondary = safeData.secondary;
        await setBrandConfig(req.tenantId, merged);
      } catch (e) { logger.warn('Failed to merge audience data into brand config', { error: e.message }); }
    }

    // If final step, activate tenant + send welcome email
    if (req.params.step === 'launch') {
      await supabase.from('tenants').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', req.tenantId);

      const { data: tenant } = await supabase.from('tenants').select('name, plan').eq('id', req.tenantId).single();
      if (req.userEmail && tenant) {
        sendWelcomeEmail({ to: req.userEmail, tenantName: tenant.name, plan: tenant.plan }).catch(() => {});
      }
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
