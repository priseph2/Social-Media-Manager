'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getSupabaseClient } = require('../../services/database/supabase-client');
const { setBrandConfig } = require('../../services/brand-config');
const { setCredentials } = require('../../services/credential-store');
const logger = require('../../utils/logger');

const router = express.Router();
router.use(authenticate);

// POST /api/tenants/setup — create tenant + assign to user
router.post('/setup', async (req, res, next) => {
  try {
    const { name, slug } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'name and slug are required' });

    const supabase = getSupabaseClient();
    if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

    // Create tenant
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .insert({ name, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'), plan: 'starter', status: 'onboarding' })
      .select()
      .single();

    if (tenantErr) {
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
router.put('/me/onboarding/:step', async (req, res, next) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'No tenant context' });
    const supabase = getSupabaseClient();
    await supabase.from('onboarding_progress').upsert({
      tenant_id: req.tenantId,
      step: req.params.step,
      completed: true,
      data: req.body,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,step' });

    // If final step, activate tenant
    if (req.params.step === 'launch') {
      await supabase.from('tenants').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', req.tenantId);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
