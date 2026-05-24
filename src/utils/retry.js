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
      const status = err.status ?? err.statusCode ?? null;

      // Do not retry client errors (4xx) except 429 Too Many Requests
      if (status !== null && status >= 400 && status < 500 && status !== 429) {
        throw err;
      }

      if (attempt === maxAttempts) break;

      // For 429, respect the retry-after header if available (in seconds)
      let delay = baseDelayMs * Math.pow(2, attempt - 1);
      if (status === 429) {
        const retryAfterSec = parseInt(err.headers?.get?.('retry-after') ?? err.responseHeaders?.['retry-after'] ?? '0', 10);
        if (retryAfterSec > 0) delay = retryAfterSec * 1000;
      }

      logger.warn(`${label} failed (attempt ${attempt}/${maxAttempts}). Retrying in ${delay}ms...`, { error: err.message });
      await sleep(delay);
    }
  }
  throw lastError;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { withRetry, sleep };
