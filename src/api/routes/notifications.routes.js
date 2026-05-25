'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { getSupabaseClient } = require('../../services/database/supabase-client');

const router = Router();
router.use(authenticate);

// GET /api/notifications — most recent 30, unread first
router.get('/', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    const { data } = await db
      .from('notifications')
      .select('id, type, title, body, link, read, created_at')
      .eq('tenant_id', req.tenantId)
      .order('read', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(30);
    res.json({ notifications: data || [] });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    await db.from('notifications').update({ read: true })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/notifications/read-all
router.post('/read-all', async (req, res, next) => {
  try {
    const db = getSupabaseClient();
    await db.from('notifications').update({ read: true })
      .eq('tenant_id', req.tenantId).eq('read', false);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/notifications — internal creation (called from other services)
router.post('/', async (req, res, next) => {
  try {
    const { type = 'info', title, body, link } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const db = getSupabaseClient();
    const { data } = await db.from('notifications')
      .insert({ tenant_id: req.tenantId, type, title, body: body || null, link: link || null })
      .select().single();
    res.status(201).json({ notification: data });
  } catch (err) { next(err); }
});

module.exports = router;
