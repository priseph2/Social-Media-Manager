'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const { errorHandler } = require('./api/middleware/error-handler');

// Routes
const orchestratorRoutes = require('./api/routes/orchestrator.routes');
const contentRoutes = require('./api/routes/content.routes');
const webhookRoutes = require('./api/routes/webhooks.routes');
const analyticsRoutes = require('./api/routes/analytics.routes');
const tenantsRoutes = require('./api/routes/tenants.routes');
const billingRoutes = require('./api/routes/billing.routes');

// Billing
const { tenantStorage } = require('./services/billing/usage-meter');

const app = express();

// ── Security ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests — please try again later' },
}));

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// ── Health check (no auth) ───────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'AI Social Media Manager', timestamp: new Date().toISOString() });
});

// ── Tenant context propagation for usage metering ─────────────────────────
// Wraps every authenticated HTTP request so Claude calls inside route handlers
// are attributed to the correct tenant via AsyncLocalStorage.
app.use((req, res, next) => {
  tenantStorage.run({ tenantId: req.tenantId || null, skill: 'api' }, () => next());
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/tenants', tenantsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/orchestrator', orchestratorRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/analytics', analyticsRoutes);
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
