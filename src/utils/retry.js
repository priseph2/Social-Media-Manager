'use strict';

const logger = require('./logger');

/**
 * Retries an async fn with exponential backoff.
 * @param {Function} fn - async function to retry
 * @param {Object}   opts
 * @param {number}   opts.maxAttempts - default 4
 * @param {number}   opts.baseDelayMs - default 1000
 * @param {string}   opts.label      - for logging
 */
async function withRetry(fn, { maxAttempts = 4, baseDelayMs = 1000, label = 'operation' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`${label} failed (attempt ${attempt}/${maxAttempts}). Retrying in ${delay}ms...`, { error: err });
      await sleep(delay);
    }
  }
  throw lastError;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { withRetry, sleep };
