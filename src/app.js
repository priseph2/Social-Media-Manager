'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const { errorHandler } = require('./api/middleware/error-handler');
const { blocklistMiddleware } = require('./api/middleware/blocklist-check');

// Routes
const authRoutes = require('./api/routes/auth.routes');
const orchestratorRoutes = require('./api/routes/orchestrator.routes');
const contentRoutes = require('./api/routes/content.routes');
const webhookRoutes = require('./api/routes/webhooks.routes');
const analyticsRoutes = require('./api/routes/analytics.routes');
const tenantsRoutes = require('./api/routes/tenants.routes');
const billingRoutes = require('./api/routes/billing.routes');
const adminRoutes = require('./api/routes/admin.routes');
const notificationsRoutes = require('./api/routes/notifications.routes');
const mediaRoutes = require('./api/routes/media.routes');

const app = express();

// ── Security ────────────────────────────────────────────────────────────────
app.use(helmet());
const corsOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim());
if (!corsOrigins?.length && process.env.NODE_ENV === 'production') {
  logger.warn('ALLOWED_ORIGINS not set — CORS blocking all cross-origin requests in production');
}
app.use(cors({ origin: corsOrigins?.length ? corsOrigins : (process.env.NODE_ENV !== 'production' ? '*' : false) }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests — please try again later' },
}));
app.use(blocklistMiddleware);

// ── Body parsing ─────────────────────────────────────────────────────────────
// The verify callback captures rawBody for HMAC verification (Paystack, Shopify, WhatsApp).
// Must run before any route handlers that need req.rawBody.
app.use(express.json({
  limit: '2mb',
  verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

// ── Health check (no auth) ───────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'AI Social Media Manager', timestamp: new Date().toISOString() });
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);    // public — no auth middleware
app.use('/api/admin', adminRoutes);
app.use('/api/tenants', tenantsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/orchestrator', orchestratorRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/webhooks', webhookRoutes);
// Paystack webhook mounted under /webhooks for consistency
app.use('/webhooks', billingRoutes);

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
