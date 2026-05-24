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

    const [tenantsRes, usageRes] = await Promise.all([
      db.from('tenants').select('id, name, plan'),
      db.from('usage_records').select('tenant_id, skill, model, cost_usd, created_at').eq('billing_period', period),
    ]);

    const tenantMap = Object.fromEntries((tenantsRes.data || []).map((t) => [t.id, t]));
    const usage = usageRes.data || [];

    const byTenant = {};
    usage.forEach((r) => {
      if (!byTenant[r.tenant_id]) byTenant[r.tenant_id] = { ops: 0, cost: 0, bySkill: {} };
      byTenant[r.tenant_id].ops++;
      byTenant[r.tenant_id].cost += r.cost_usd || 0;
      byTenant[r.tenant_id].bySkill[r.skill] = (byTenant[r.tenant_id].bySkill[r.skill] || 0) + 1;
    });

    const byTenantList = Object.entries(byTenant)
      .map(([tenantId, u]) => ({
        tenantId,
        tenantName: tenantMap[tenantId]?.name || tenantId,
        plan: tenantMap[tenantId]?.plan || '—',
        ops: u.ops,
        costUsd: parseFloat(u.cost.toFixed(4)),
        topSkill: Object.entries(u.bySkill).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
        bySkill: u.bySkill,
      }))
      .sort((a, b) => b.ops - a.ops);

    const bySkill = usage.reduce((acc, r) => {
      if (!acc[r.skill]) acc[r.skill] = { ops: 0, cost: 0 };
      acc[r.skill].ops++;
      acc[r.skill].cost += r.cost_usd || 0;
      return acc;
    }, {});
    Object.values(bySkill).forEach((v) => { v.cost = parseFloat(v.cost.toFixed(4)); });

    res.json({
      period,
      totals: {
        ops: usage.length,
        costUsd: parseFloat(usage.reduce((s, r) => s + (r.cost_usd || 0), 0).toFixed(4)),
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

module.exports = router;
