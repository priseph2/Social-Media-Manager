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
  res.json({ status: 'ok', service: 'Cascades Luxury AI', timestamp: new Date().toISOString() });
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/orchestrator', orchestratorRoutes);
app.use('/api/content', contentRoutes);
app.use('/webhooks', webhookRoutes);

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
