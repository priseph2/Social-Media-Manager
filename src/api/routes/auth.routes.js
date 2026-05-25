'use strict';

const { Router } = require('express');
const { validateSignup } = require('../../services/abuse-prevention');

const router = Router();

/**
 * POST /api/auth/validate-signup
 * Public endpoint — no auth required.
 * Called from the signup page BEFORE creating a Supabase user,
 * so blocked users never get a Supabase account at all.
 *
 * Body: { email: string }
 * Returns: { allowed: true } | { allowed: false, reason: string }
 */
router.post('/validate-signup', async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ allowed: false, reason: 'Email is required.' });
  }

  // Use X-Forwarded-For (set by Vercel/Cloudflare) or fall back to socket IP
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) || req.ip;
  const result = await validateSignup({ email: email.toLowerCase().trim(), ip });
  res.json(result);
});

module.exports = router;
