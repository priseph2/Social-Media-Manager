'use strict';

require('dotenv').config();

const logger = require('./utils/logger');
const { getDbConfig } = require('./config/database');
const { connectMongoDB, closeMongoDB } = require('./services/database/mongodb-client');
const { getRedisClient, closeRedis } = require('./services/database/redis-client');
const { initScheduler, stopScheduler } = require('./orchestrator/scheduler');
const orchestrator = require('./orchestrator/orchestrator');
const { closeAllQueues } = require('./orchestrator/message-queue');
const app = require('./app');

const PORT = process.env.PORT || 3000;

async function start() {
  logger.info('╔══════════════════════════════════════════════╗');
  logger.info('║     Cascades Luxury AI System — Starting     ║');
  logger.info('╚══════════════════════════════════════════════╝');

  // ── Validate required environment variables ───────────────────────────────
  try {
    const dbConfig = getDbConfig();
    if (process.env._MISSING_OPTIONAL_DB) {
      const missing = process.env._MISSING_OPTIONAL_DB.split(',');
      logger.warn(`Optional services not configured (some features disabled): ${missing.join(', ')}`);
    }
  } catch (err) {
    logger.error('Missing required environment variables', { error: err });
    process.exit(1);
  }

  // ── Connect databases (gracefully degrade if not configured) ─────────────
  await connectMongoDB();
  const redis = getRedisClient(); // will warn if REDIS_URL not set

  // ── Initialise orchestrator (all skills + queue workers) ─────────────────
  await orchestrator.init();

  // ── Start cron scheduler ─────────────────────────────────────────────────
  initScheduler();

  // ── Start HTTP server ────────────────────────────────────────────────────
  const server = app.listen(PORT, () => {
    logger.info(`API server running on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info(`System status: http://localhost:${PORT}/api/orchestrator/status`);
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully...`);
    server.close(async () => {
      stopScheduler();
      await closeAllQueues();
      await closeMongoDB();
      await closeRedis();
      logger.info('Shutdown complete.');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15000); // Force exit after 15s
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err });
    shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
  });
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
