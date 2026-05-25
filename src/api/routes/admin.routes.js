'use strict';

const { Router } = require('express');
const { requireSuperAdmin } = require('../middleware/admin-auth');
const { getSupabaseClient } = require('../../services/database/supabase-client');
const { isMongoAvailable } = require('../../services/database/mongodb-client');
const { getRedisClient } = require('../../services/database/redis-client');
const { getQueue } = require('../../orchestrator/message-queue');
const { QUEUES } = require('../../config/constants');
const { PLANS } = require('../../config/plans');
const { VALID_PROVIDERS, invalidateProviderCache } = require('../../services/image-generation');
const logger = require('../../utils/logger');

const router = Router();
router.use(requireSuperAdmin);

const PLAN_PRICES_USD = Object.fromEntries(Object.values(PLANS).map((p) => [p.id, p.priceUSD]));

// ── Overview ─────────────────────────────────────────────────────────────────

router.get('/overview', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const period = new Date().toISOString().slice(0, 7);

    const [tenantsRes, subsRes, usageRes, escRes, tasksRes] = await Promise.all([
      db.from('tenants').select('id, name, plan, status'),
      db.from('subscriptions').select('tenant_id, plan, status'),
      db.from('usage_records').select('tenant_id, cost_usd, skill').eq('billing_period', period),
      db.from('escalations').select('id', { count: 'exact', head: true }).eq('resolved', false),
      db.from('task_log')
        .select('id, skill, action, status, tenant_id, completed_at')
        .order('completed_at', { ascending: false })
        .limit(15),
    ]);

    const tenants = tenantsRes.data || [];
    const subs = subsRes.data || [];
    const usage = usageRes.data || [];

    const mrrUsd = subs
      .filter((s) => s.status === 'active')
      .reduce((sum, s) => sum + (PLAN_PRICES_USD[s.plan] || 0), 0);

    const byStatus = tenants.reduce((a, t) => { a[t.status] = (a[t.status] || 0) + 1; return a; }, {});
    const byPlan = tenants.reduce((a, t) => { a[t.plan] = (a[t.plan] || 0) + 1; return a; }, {});

    const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t.name]));

    res.json({
      tenants: { total: tenants.length, byStatus, byPlan },
      billing: { mrrUsd },
      usage: {
        opsThisMonth: usage.length,
        costThisMonthUsd: parseFloat(usage.reduce((s, r) => s + (r.cost_usd || 0), 0).toFixed(4)),
      },
      openEscalations: escRes.count || 0,
      recentActivity: (tasksRes.data || []).map((t) => ({
        ...t,
        tenantName: tenantMap[t.tenant_id] || '—',
      })),
      services: {
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
        redis: Boolean(process.env.REDIS_URL),
        supabase: Boolean(process.env.SUPABASE_URL),
        mongodb: Boolean(process.env.MONGODB_URI),
        buffer: Boolean(process.env.BUFFER_ACCESS_TOKEN),
        mailchimp: Boolean(process.env.MAILCHIMP_API_KEY),
        paystack: Boolean(process.env.PAYSTACK_SECRET_KEY),
      },
    });
  } catch (err) { next(err); }
});

// ── Tenants ───────────────────────────────────────────────────────────────────

router.get('/tenants', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const period = new Date().toISOString().slice(0, 7);
    const { search, plan, status } = req.query;

    let q = db.from('tenants').select('id, name, slug, plan, status, created_at, updated_at').order('created_at', { ascending: false });
    if (plan) q = q.eq('plan', plan);
    if (status) q = q.eq('status', status);

    const [tenantsRes, subsRes, usageRes, connRes] = await Promise.all([
      q,
      db.from('subscriptions').select('tenant_id, plan, status, current_period_end'),
      db.from('usage_records').select('tenant_id, cost_usd').eq('billing_period', period),
      db.from('platform_connections').select('tenant_id, platform').eq('status', 'connected'),
    ]);

    const tenants = tenantsRes.data || [];

    const usageByTenant = (usageRes.data || []).reduce((acc, r) => {
      if (!acc[r.tenant_id]) acc[r.tenant_id] = { ops: 0, cost: 0 };
      acc[r.tenant_id].ops++;
      acc[r.tenant_id].cost += r.cost_usd || 0;
      return acc;
    }, {});

    const connByTenant = (connRes.data || []).reduce((acc, c) => {
      if (!acc[c.tenant_id]) acc[c.tenant_id] = [];
      acc[c.tenant_id].push(c.platform);
      return acc;
    }, {});

    const subByTenant = Object.fromEntries((subsRes.data || []).map((s) => [s.tenant_id, s]));

    let result = tenants.map((t) => ({
      ...t,
      subscription: subByTenant[t.id] || null,
      usage: usageByTenant[t.id] ? {
        ops: usageByTenant[t.id].ops,
        costUsd: parseFloat(usageByTenant[t.id].cost.toFixed(4)),
      } : { ops: 0, costUsd: 0 },
      connections: connByTenant[t.id] || [],
    }));

    if (search) {
      const s = search.toLowerCase();
      result = result.filter((t) => t.name?.toLowerCase().includes(s) || t.slug?.toLowerCase().includes(s));
    }

    res.json({ tenants: result, total: result.length });
  } catch (err) { next(err); }
});

router.get('/tenants/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const db = getSupabaseClient();
    const period = new Date().toISOString().slice(0, 7);

    const [tenantRes, subRes, connRes, onboardRes, usageRes, escRes, taskRes] = await Promise.all([
      db.from('tenants').select('*').eq('id', id).single(),
      db.from('subscriptions').select('*').eq('tenant_id', id).maybeSingle(),
      db.from('platform_connections').select('platform, status, connected_at, metadata').eq('tenant_id', id),
      db.from('onboarding_progress').select('step, completed, completed_at').eq('tenant_id', id),
      db.from('usage_records').select('skill, cost_usd, billing_period, created_at').eq('tenant_id', id).order('created_at', { ascending: false }).limit(200),
      db.from('escalations').select('id, type, reason, created_at, resolved, human_note').eq('tenant_id', id).order('created_at', { ascending: false }).limit(10),
      db.from('task_log').select('id, skill, action, status, duration_ms, escalated, completed_at').eq('tenant_id', id).order('completed_at', { ascending: false }).limit(25),
    ]);

    if (!tenantRes.data) return res.status(404).json({ error: 'Tenant not found' });

    const usageByPeriod = (usageRes.data || []).reduce((acc, r) => {
      if (!acc[r.billing_period]) acc[r.billing_period] = { ops: 0, costUsd: 0 };
      acc[r.billing_period].ops++;
      acc[r.billing_period].costUsd += r.cost_usd || 0;
      return acc;
    }, {});
    Object.values(usageByPeriod).forEach((v) => { v.costUsd = parseFloat(v.costUsd.toFixed(4)); });

    const thisMonth = usageByPeriod[period] || { ops: 0, costUsd: 0 };

    res.json({
      tenant: tenantRes.data,
      subscription: subRes.data || null,
      connections: connRes.data || [],
      onboarding: onboardRes.data || [],
      usageByPeriod,
      usageThisMonth: thisMonth,
      recentEscalations: escRes.data || [],
      recentActivity: taskRes.data || [],
    });
  } catch (err) { next(err); }
});

router.patch('/tenants/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { plan, status, image_provider } = req.body;
    const db = getSupabaseClient();

    const tenantUpdates = { updated_at: new Date().toISOString() };
    if (plan && ['starter', 'growth', 'agency'].includes(plan)) tenantUpdates.plan = plan;
    if (status && ['active', 'suspended', 'onboarding'].includes(status)) tenantUpdates.status = status;
    if (image_provider && VALID_PROVIDERS.includes(image_provider)) {
      tenantUpdates.image_provider = image_provider;
    }

    if (Object.keys(tenantUpdates).length === 1) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await db.from('tenants').update(tenantUpdates).eq('id', id);

    if (plan) {
      await db.from('subscriptions').upsert(
        { tenant_id: id, plan, updated_at: new Date().toISOString() },
        { onConflict: 'tenant_id' }
      );
    }

    if (image_provider) invalidateProviderCache(id);

    logger.info(`Admin updated tenant ${id}`, { updates: tenantUpdates, adminEmail: req.adminUser.email });
    res.json({ success: true, id });
  } catch (err) { next(err); }
});

// ── Job Queues ────────────────────────────────────────────────────────────────

router.get('/jobs', async (req, res, next) => {
  try {
    const redis = getRedisClient();
    if (!redis) return res.json({ available: false, queues: {} });

    const queueNames = Object.values(QUEUES);
    const stats = {};

    await Promise.all(queueNames.map(async (name) => {
      const queue = getQueue(name);
      if (!queue) { stats[name] = { available: false }; return; }
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
        stats[name] = { available: true, ...counts };
      } catch (err) {
        stats[name] = { available: false, error: err.message };
      }
    }));

    res.json({ available: true, queues: stats });
  } catch (err) { next(err); }
});

router.get('/jobs/failed', async (req, res, next) => {
  try {
    const redis = getRedisClient();
    if (!redis) return res.json({ available: false, jobs: [] });

    const queueNames = Object.values(QUEUES);
    const failed = [];

    await Promise.all(queueNames.map(async (name) => {
      const queue = getQueue(name);
      if (!queue) return;
      try {
        const jobs = await queue.getFailed(0, 4);
        jobs.forEach((j) => failed.push({
          queue: name,
          id: String(j.id),
          name: j.name,
          failedReason: j.failedReason,
          attemptsMade: j.attemptsMade,
          timestamp: new Date(j.timestamp).toISOString(),
          tenantId: j.data?.tenantId || null,
        }));
      } catch {}
    }));

    failed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({ jobs: failed.slice(0, 20) });
  } catch (err) { next(err); }
});

router.post('/jobs/:queue/clean', async (req, res, next) => {
  try {
    const { queue: queueName } = req.params;
    if (!Object.values(QUEUES).includes(queueName)) {
      return res.status(400).json({ error: 'Invalid queue name' });
    }
    const queue = getQueue(queueName);
    if (!queue) return res.status(503).json({ error: 'Queue unavailable' });
    const count = await queue.clean(0, 100, 'failed');
    logger.info(`Admin cleaned failed jobs from ${queueName}`, { count, adminEmail: req.adminUser.email });
    res.json({ success: true, cleaned: count, queue: queueName });
  } catch (err) { next(err); }
});

// ── Service Health ────────────────────────────────────────────────────────────

router.get('/services', async (req, res, next) => {
  try {
    const checks = {};

    await Promise.all([
      (async () => {
        try {
          const redis = getRedisClient();
          if (!redis) { checks.redis = { status: 'not_configured' }; return; }
          const start = Date.now();
          const pong = await redis.ping();
          checks.redis = { status: pong === 'PONG' ? 'ok' : 'degraded', latencyMs: Date.now() - start };
        } catch (err) { checks.redis = { status: 'error', error: err.message }; }
      })(),

      (async () => {
        try {
          if (!isMongoAvailable()) { checks.mongodb = { status: 'not_configured' }; return; }
          const Content = require('../../models/content.model');
          const start = Date.now();
          await Content.estimatedDocumentCount();
          checks.mongodb = { status: 'ok', latencyMs: Date.now() - start };
        } catch (err) { checks.mongodb = { status: 'error', error: err.message }; }
      })(),

      (async () => {
        try {
          const db = getSupabaseClient();
          if (!db) { checks.supabase = { status: 'not_configured' }; return; }
          const start = Date.now();
          await db.from('tenants').select('id', { count: 'exact', head: true });
          checks.supabase = { status: 'ok', latencyMs: Date.now() - start };
        } catch (err) { checks.supabase = { status: 'error', error: err.message }; }
      })(),
    ]);

    checks.anthropic = { status: process.env.ANTHROPIC_API_KEY ? 'configured' : 'not_configured' };
    checks.buffer = { status: process.env.BUFFER_ACCESS_TOKEN ? 'configured' : 'not_configured' };
    checks.mailchimp = { status: process.env.MAILCHIMP_API_KEY ? 'configured' : 'not_configured' };
    checks.paystack = { status: process.env.PAYSTACK_SECRET_KEY ? 'configured' : 'not_configured' };
    checks.openai = { status: process.env.OPENAI_API_KEY ? 'configured' : 'not_configured' };
    checks.google = { status: process.env.GOOGLE_API_KEY ? 'configured' : 'not_configured' };

    res.json({ services: checks, checkedAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

// ── Usage Analytics ───────────────────────────────────────────────────────────

router.get('/usage', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const period = req.query.period || new Date().toISOString().slice(0, 7);

    const [tenantsRes, usageRes, imageRes] = await Promise.all([
      db.from('tenants').select('id, name, plan'),
      db.from('usage_records').select('tenant_id, skill, model, cost_usd, ops_count').eq('billing_period', period),
      db.from('usage_records').select('tenant_id, image_count, image_cost_usd').eq('billing_period', period).gt('image_count', 0),
    ]);

    const tenantMap = Object.fromEntries((tenantsRes.data || []).map((t) => [t.id, t]));
    const usage = (usageRes.data || []).filter((r) => (r.ops_count || 0) > 0);
    const imageUsage = imageRes.data || [];

    // AI ops aggregation
    const byTenant = {};
    usage.forEach((r) => {
      if (!byTenant[r.tenant_id]) byTenant[r.tenant_id] = { ops: 0, cost: 0, images: 0, imageCost: 0, bySkill: {} };
      byTenant[r.tenant_id].ops += r.ops_count || 1;
      byTenant[r.tenant_id].cost += r.cost_usd || 0;
      byTenant[r.tenant_id].bySkill[r.skill] = (byTenant[r.tenant_id].bySkill[r.skill] || 0) + (r.ops_count || 1);
    });

    // Image ops aggregation (merge into same byTenant map)
    imageUsage.forEach((r) => {
      if (!byTenant[r.tenant_id]) byTenant[r.tenant_id] = { ops: 0, cost: 0, images: 0, imageCost: 0, bySkill: {} };
      byTenant[r.tenant_id].images += r.image_count || 0;
      byTenant[r.tenant_id].imageCost += r.image_cost_usd || 0;
    });

    const byTenantList = Object.entries(byTenant)
      .map(([tenantId, u]) => ({
        tenantId,
        tenantName: tenantMap[tenantId]?.name || tenantId,
        plan: tenantMap[tenantId]?.plan || '—',
        ops: u.ops,
        costUsd: parseFloat(u.cost.toFixed(4)),
        images: u.images,
        imageCostUsd: parseFloat(u.imageCost.toFixed(4)),
        topSkill: Object.entries(u.bySkill).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
        bySkill: u.bySkill,
      }))
      .sort((a, b) => b.ops - a.ops);

    const bySkill = usage.reduce((acc, r) => {
      if (!acc[r.skill]) acc[r.skill] = { ops: 0, cost: 0 };
      acc[r.skill].ops += r.ops_count || 1;
      acc[r.skill].cost += r.cost_usd || 0;
      return acc;
    }, {});
    Object.values(bySkill).forEach((v) => { v.cost = parseFloat(v.cost.toFixed(4)); });

    const totalImages = imageUsage.reduce((s, r) => s + (r.image_count || 0), 0);
    const totalImageCost = imageUsage.reduce((s, r) => s + (r.image_cost_usd || 0), 0);

    res.json({
      period,
      totals: {
        ops: usage.reduce((s, r) => s + (r.ops_count || 1), 0),
        costUsd: parseFloat(usage.reduce((s, r) => s + (r.cost_usd || 0), 0).toFixed(4)),
        images: totalImages,
        imageCostUsd: parseFloat(totalImageCost.toFixed(4)),
      },
      byTenant: byTenantList,
      bySkill,
    });
  } catch (err) { next(err); }
});

// ── All Escalations ───────────────────────────────────────────────────────────

router.get('/escalations', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const resolved = req.query.resolved === 'true';

    const [escRes, tenantsRes] = await Promise.all([
      db.from('escalations').select('*').eq('resolved', resolved).order('created_at', { ascending: false }).limit(100),
      db.from('tenants').select('id, name'),
    ]);

    const tenantMap = Object.fromEntries((tenantsRes.data || []).map((t) => [t.id, t.name]));
    const escalations = (escRes.data || []).map((e) => ({
      ...e,
      tenantName: tenantMap[e.tenant_id] || '—',
    }));

    res.json({ escalations, total: escalations.length });
  } catch (err) { next(err); }
});

// ── Users ─────────────────────────────────────────────────────────────────────

router.get('/users', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const { data: { users }, error } = await db.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;

    const tenants = (await db.from('tenants').select('id, name, plan, status')).data || [];
    const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t]));

    const result = users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.app_metadata?.role || null,
      tenantId: u.app_metadata?.tenant_id || null,
      tenant: u.app_metadata?.tenant_id ? (tenantMap[u.app_metadata.tenant_id] || null) : null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      emailConfirmed: !!u.email_confirmed_at,
      isBanned: u.banned_until ? new Date(u.banned_until) > new Date() : false,
    }));

    res.json({ users: result, total: result.length });
  } catch (err) { next(err); }
});

router.patch('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, ban } = req.body;
    const db = getSupabaseClient();

    const { data: { user: current } } = await db.auth.admin.getUserById(id);
    if (!current) return res.status(404).json({ error: 'User not found' });

    const updates = {};
    if (role !== undefined) {
      updates.app_metadata = { ...(current.app_metadata || {}), role: role || null };
    }
    if (ban === true)  updates.ban_duration = '876600h';
    if (ban === false) updates.ban_duration = 'none';

    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields to update' });

    const { error } = await db.auth.admin.updateUserById(id, updates);
    if (error) throw error;

    logger.info(`Admin updated user ${id}`, { role, ban, adminEmail: req.adminUser.email });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Global Config ─────────────────────────────────────────────────────────────

const ALLOWED_CONFIG_KEYS = new Set([
  'rate_limit_free', 'rate_limit_starter', 'rate_limit_growth', 'rate_limit_agency',
  'brand_min_quality_score', 'brand_auto_approve_threshold', 'brand_high_risk_threshold',
  'maintenance_mode', 'maintenance_message',
]);

router.get('/config', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const { data } = await db.from('global_config').select('key, value, updated_at, updated_by');
    const config = Object.fromEntries((data || []).map((r) => [r.key, r]));
    const { RATE_LIMITS, BRAND, MODELS } = require('../../config/constants');
    res.json({ config, defaults: { rateLimits: RATE_LIMITS, brand: BRAND, models: MODELS } });
  } catch (err) { next(err); }
});

router.put('/config/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (!ALLOWED_CONFIG_KEYS.has(key)) return res.status(400).json({ error: `Unknown config key: ${key}` });
    if (value === undefined) return res.status(400).json({ error: 'value required' });

    const db = getSupabaseClient();
    await db.from('global_config').upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: req.adminUser.email },
      { onConflict: 'key' }
    );
    logger.info('Admin updated global config', { key, adminEmail: req.adminUser.email });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Billing Summary ───────────────────────────────────────────────────────────

router.get('/billing/summary', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const PLAN_PRICES = { free: 0, starter: 49, growth: 149, agency: 399 };

    const [subsRes, eventsRes, tenantsRes] = await Promise.all([
      db.from('subscriptions').select('plan, status, tenant_id, current_period_end, updated_at'),
      db.from('billing_events').select('event_type, payload, created_at, tenant_id').order('created_at', { ascending: false }).limit(30),
      db.from('tenants').select('id, name'),
    ]);

    const subs = subsRes.data || [];
    const tenantMap = Object.fromEntries((tenantsRes.data || []).map((t) => [t.id, t.name]));
    const activeSubs = subs.filter((s) => s.status === 'active');
    const mrrUsd = activeSubs.reduce((sum, s) => sum + (PLAN_PRICES[s.plan] || 0), 0);

    const byPlan = {};
    for (const plan of ['free', 'starter', 'growth', 'agency']) {
      const planSubs = subs.filter((s) => s.plan === plan);
      const active = planSubs.filter((s) => s.status === 'active').length;
      byPlan[plan] = {
        total: planSubs.length,
        active,
        cancelled: planSubs.filter((s) => s.status === 'cancelled').length,
        trialing: planSubs.filter((s) => s.status === 'trialing').length,
        revenue: active * (PLAN_PRICES[plan] || 0),
        priceUsd: PLAN_PRICES[plan] || 0,
      };
    }

    res.json({
      mrrUsd,
      arrUsd: mrrUsd * 12,
      totalSubscriptions: subs.length,
      activeSubscriptions: activeSubs.length,
      byPlan,
      recentEvents: (eventsRes.data || []).map((e) => ({ ...e, tenantName: tenantMap[e.tenant_id] || '—' })),
    });
  } catch (err) { next(err); }
});

// ── Overview (enhanced with failed-job count) ─────────────────────────────────

router.get('/overview/jobs-count', async (req, res, next) => {
  try {
    const redis = getRedisClient();
    if (!redis) return res.json({ failedJobs: 0 });
    const queueNames = Object.values(QUEUES);
    let failed = 0;
    await Promise.all(queueNames.map(async (name) => {
      const queue = getQueue(name);
      if (!queue) return;
      try { const counts = await queue.getJobCounts('failed'); failed += counts.failed || 0; } catch {}
    }));
    res.json({ failedJobs: failed });
  } catch (err) { next(err); }
});

// ── Audit Log ─────────────────────────────────────────────────────────────────

async function writeAudit(db, adminEmail, action, entityType, entityId, metadata = {}) {
  try {
    await db.from('admin_audit_log').insert({ admin_email: adminEmail, action, entity_type: entityType, entity_id: String(entityId || ''), metadata });
  } catch (_) { /* non-blocking */ }
}

router.get('/audit', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const limit = Math.min(parseInt(req.query.limit || '50'), 200);
    const offset = parseInt(req.query.offset || '0');
    let q = db.from('admin_audit_log').select('*', { count: 'exact' })
      .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (req.query.entity_type) q = q.eq('entity_type', req.query.entity_type);
    if (req.query.action) q = q.ilike('action', `%${req.query.action}%`);
    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ entries: data || [], total: count || 0 });
  } catch (err) { next(err); }
});

// ── Metrics ────────────────────────────────────────────────────────────────────

router.get('/metrics/realtime', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const now = new Date();
    const oneHourAgo  = new Date(now - 3600000).toISOString();
    const oneDayAgo   = new Date(now - 86400000).toISOString();
    const period      = now.toISOString().slice(0, 7);

    const [recentRes, failedRes, activeRes, costRes, newRes] = await Promise.all([
      db.from('task_log').select('id', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
      db.from('task_log').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', oneHourAgo),
      db.from('task_log').select('tenant_id').gte('created_at', oneDayAgo),
      db.from('usage_records').select('cost_usd').eq('billing_period', period),
      db.from('tenants').select('id', { count: 'exact', head: true }).gte('created_at', oneDayAgo),
    ]);

    res.json({
      opsLastHour:       recentRes.count  || 0,
      failedLastHour:    failedRes.count  || 0,
      activeTenantsToday: new Set((activeRes.data || []).map((r) => r.tenant_id)).size,
      costThisMonthUsd:  parseFloat(((costRes.data || []).reduce((s, r) => s + (r.cost_usd || 0), 0)).toFixed(4)),
      newTenantsToday:   newRes.count     || 0,
    });
  } catch (err) { next(err); }
});

router.get('/metrics/heatmap', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data } = await db.from('task_log').select('created_at').gte('created_at', thirtyDaysAgo);
    const byDay = {};
    for (const row of (data || [])) {
      const d = row.created_at.slice(0, 10);
      byDay[d] = (byDay[d] || 0) + 1;
    }
    const heatmap = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      heatmap.push({ date: d, count: byDay[d] || 0 });
    }
    res.json({ heatmap });
  } catch (err) { next(err); }
});

// ── Tenant Notes ────────────────────────────────────────────────────────────────

router.get('/tenants/:id/notes', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const { data } = await db.from('tenant_notes').select('*').eq('tenant_id', req.params.id).order('created_at', { ascending: false });
    res.json({ notes: data || [] });
  } catch (err) { next(err); }
});

router.post('/tenants/:id/notes', async (req, res, next) => {
  try {
    const { note } = req.body;
    if (!note?.trim()) return res.status(400).json({ error: 'Note text required' });
    const db = getSupabaseClient();
    const { data, error } = await db.from('tenant_notes').insert({ tenant_id: req.params.id, note: note.trim(), created_by: req.adminUser.email }).select().single();
    if (error) throw error;
    await writeAudit(db, req.adminUser.email, 'add_note', 'tenant', req.params.id, { preview: note.trim().slice(0, 80) });
    res.json({ note: data });
  } catch (err) { next(err); }
});

router.delete('/tenants/:id/notes/:noteId', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    await db.from('tenant_notes').delete().eq('id', req.params.noteId).eq('tenant_id', req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Impersonate Tenant ─────────────────────────────────────────────────────────

router.post('/tenants/:id/impersonate', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const { data: { users } } = await db.auth.admin.listUsers({ perPage: 500 });
    const tenantUser = users.find((u) => u.app_metadata?.tenant_id === req.params.id);
    if (!tenantUser) return res.status(404).json({ error: 'No user found for this tenant' });
    const { data, error } = await db.auth.admin.generateLink({
      type: 'magiclink',
      email: tenantUser.email,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/dashboard` },
    });
    if (error) throw error;
    await writeAudit(db, req.adminUser.email, 'impersonate', 'tenant', req.params.id, { targetEmail: tenantUser.email });
    logger.warn(`Admin ${req.adminUser.email} generated impersonation link for tenant ${req.params.id}`);
    res.json({ link: data?.properties?.action_link || data?.action_link || null });
  } catch (err) { next(err); }
});

// ── Billing: Churn & Dunning ───────────────────────────────────────────────────

router.get('/billing/churn', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const [cancelledRes, createdRes] = await Promise.all([
      db.from('billing_events').select('created_at').eq('event_type', 'subscription_cancelled').order('created_at', { ascending: false }).limit(500),
      db.from('billing_events').select('created_at').eq('event_type', 'subscription_created').order('created_at', { ascending: false }).limit(500),
    ]);
    const byMonth = {};
    for (const e of (cancelledRes.data || [])) {
      const m = e.created_at.slice(0, 7);
      if (!byMonth[m]) byMonth[m] = { lost: 0, gained: 0 };
      byMonth[m].lost++;
    }
    for (const e of (createdRes.data || [])) {
      const m = e.created_at.slice(0, 7);
      if (!byMonth[m]) byMonth[m] = { lost: 0, gained: 0 };
      byMonth[m].gained++;
    }
    const months = Object.entries(byMonth).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12).map(([month, v]) => ({ month, ...v, net: v.gained - v.lost }));
    res.json({ months });
  } catch (err) { next(err); }
});

router.get('/billing/dunning', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const [failedRes, tenantsRes] = await Promise.all([
      db.from('billing_events').select('tenant_id, payload, created_at').eq('event_type', 'payment_failed').order('created_at', { ascending: false }),
      db.from('tenants').select('id, name, plan, status'),
    ]);
    const tenantMap = Object.fromEntries((tenantsRes.data || []).map((t) => [t.id, t]));
    const byTenant = {};
    for (const e of (failedRes.data || [])) {
      if (!byTenant[e.tenant_id]) byTenant[e.tenant_id] = { count: 0, lastFailedAt: e.created_at, amount: 0 };
      byTenant[e.tenant_id].count++;
      if (e.payload?.amount) byTenant[e.tenant_id].amount = e.payload.amount;
    }
    const dunning = Object.entries(byTenant).map(([tid, v]) => ({
      tenantId: tid, tenantName: tenantMap[tid]?.name || '—',
      plan: tenantMap[tid]?.plan || '—', status: tenantMap[tid]?.status || '—', ...v,
    })).sort((a, b) => b.count - a.count);
    res.json({ dunning });
  } catch (err) { next(err); }
});

// ── Content Approvals ──────────────────────────────────────────────────────────

router.get('/content/pending', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const [approvalsRes, tenantsRes] = await Promise.all([
      db.from('content_approvals').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      db.from('tenants').select('id, name'),
    ]);
    const tenantMap = Object.fromEntries((tenantsRes.data || []).map((t) => [t.id, t.name]));
    res.json({ pending: (approvalsRes.data || []).map((a) => ({ ...a, tenantName: tenantMap[a.tenant_id] || '—' })) });
  } catch (err) { next(err); }
});

router.post('/content/:id/approve', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    await db.from('content_approvals').update({ status: 'approved', reviewed_by: req.adminUser.email, reviewed_at: new Date().toISOString() }).eq('id', req.params.id);
    await writeAudit(db, req.adminUser.email, 'approve_content', 'content_approval', req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/content/:id/reject', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const db = getSupabaseClient();
    await db.from('content_approvals').update({ status: 'rejected', review_reason: reason || null, reviewed_by: req.adminUser.email, reviewed_at: new Date().toISOString() }).eq('id', req.params.id);
    await writeAudit(db, req.adminUser.email, 'reject_content', 'content_approval', req.params.id, { reason });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── AI Costs Per Tenant ────────────────────────────────────────────────────────

router.get('/ai/costs', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const period = new Date().toISOString().slice(0, 7);
    const [usageRes, tenantsRes] = await Promise.all([
      db.from('usage_records').select('tenant_id, skill, cost_usd').eq('billing_period', period),
      db.from('tenants').select('id, name, plan'),
    ]);
    const tenantMap = Object.fromEntries((tenantsRes.data || []).map((t) => [t.id, t]));
    const byTenant = {};
    for (const r of (usageRes.data || [])) {
      if (!byTenant[r.tenant_id]) byTenant[r.tenant_id] = { ops: 0, costUsd: 0, bySkill: {} };
      byTenant[r.tenant_id].ops++;
      byTenant[r.tenant_id].costUsd += r.cost_usd || 0;
      if (!byTenant[r.tenant_id].bySkill[r.skill]) byTenant[r.tenant_id].bySkill[r.skill] = { ops: 0, costUsd: 0 };
      byTenant[r.tenant_id].bySkill[r.skill].ops++;
      byTenant[r.tenant_id].bySkill[r.skill].costUsd += r.cost_usd || 0;
    }
    const tenants = Object.entries(byTenant).map(([tid, v]) => ({
      tenantId: tid, tenantName: tenantMap[tid]?.name || '—', plan: tenantMap[tid]?.plan || '—',
      ops: v.ops, costUsd: parseFloat(v.costUsd.toFixed(4)),
      bySkill: Object.entries(v.bySkill).map(([skill, sv]) => ({ skill, ops: sv.ops, costUsd: parseFloat(sv.costUsd.toFixed(4)) })).sort((a, b) => b.costUsd - a.costUsd),
    })).sort((a, b) => b.costUsd - a.costUsd);
    res.json({ tenants, period });
  } catch (err) { next(err); }
});

// ── Security ───────────────────────────────────────────────────────────────────

router.get('/security/suspicious', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const { data: { users } } = await db.auth.admin.listUsers({ perPage: 500 });
    const disposable = ['mailinator.com','guerrillamail.com','tempmail.com','throwaway.email','yopmail.com','10minutemail.com','trashmail.com','sharklasers.com'];
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const suspicious = users
      .filter((u) => {
        const isDisposable = disposable.some((d) => u.email?.endsWith('@' + d));
        const isOldUnconfirmed = !u.email_confirmed_at && new Date(u.created_at) < sevenDaysAgo;
        return isDisposable || isOldUnconfirmed;
      })
      .map((u) => ({
        id: u.id, email: u.email, createdAt: u.created_at,
        emailConfirmed: !!u.email_confirmed_at, isBanned: !!u.banned_until,
        reason: disposable.some((d) => u.email?.endsWith('@' + d)) ? 'Disposable email domain' : 'Unconfirmed > 7 days',
      }));
    res.json({ suspicious });
  } catch (err) { next(err); }
});

router.get('/security/blocklist', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const { data } = await db.from('ip_blocklist').select('*').order('created_at', { ascending: false });
    res.json({ blocklist: data || [] });
  } catch (err) { next(err); }
});

router.post('/security/blocklist', async (req, res, next) => {
  try {
    const { value, type = 'ip', reason } = req.body;
    if (!value?.trim()) return res.status(400).json({ error: 'Value required' });
    const db = getSupabaseClient();
    const { data, error } = await db.from('ip_blocklist').insert({ value: value.trim(), type, reason: reason || null, created_by: req.adminUser.email }).select().single();
    if (error?.code === '23505') return res.status(409).json({ error: 'Already in blocklist' });
    if (error) throw error;
    await writeAudit(db, req.adminUser.email, 'add_blocklist', 'ip_blocklist', data.id, { value: value.trim(), type });
    res.json({ entry: data });
  } catch (err) { next(err); }
});

router.delete('/security/blocklist/:id', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    await db.from('ip_blocklist').delete().eq('id', req.params.id);
    await writeAudit(db, req.adminUser.email, 'remove_blocklist', 'ip_blocklist', req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
