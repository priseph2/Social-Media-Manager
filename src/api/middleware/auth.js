'use strict';

const logger = require('../../utils/logger');

/**
 * Bearer token authentication for the Cascades Luxury AI API.
 * Set API_SECRET_KEY in your .env to secure all endpoints.
 */
function authenticate(req, res, next) {
  const apiKey = process.env.API_SECRET_KEY;
  if (!apiKey) {
    // No key configured — open access (dev mode only)
    logger.warn('API_SECRET_KEY not set — all requests allowed (unsafe in production)');
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header. Use: Bearer <API_SECRET_KEY>' });
  }

  const token = authHeader.slice(7);
  if (token !== apiKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next();
}

module.exports = { authenticate };
