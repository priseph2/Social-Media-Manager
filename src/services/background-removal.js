'use strict';

const logger = require('../utils/logger');

/**
 * Remove the background from an image using the remove.bg REST API.
 * Accepts a public URL — remove.bg fetches the image directly.
 * Requires REMOVEBG_API_KEY env var; returns { wasProcessed: false } if unset.
 *
 * @param {string} imageUrl  Publicly accessible URL of the source image
 * @returns {Promise<{ buffer?: Buffer, wasProcessed: boolean }>}
 */
async function removeBackground(imageUrl) {
  const apiKey = process.env.REMOVEBG_API_KEY;
  if (!apiKey) {
    logger.info('[BgRemoval] REMOVEBG_API_KEY not set — skipping background removal');
    return { wasProcessed: false };
  }

  const body = new URLSearchParams({ image_url: imageUrl, size: 'auto' });

  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`remove.bg HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  logger.info('[BgRemoval] Background removed successfully', { imageUrl });
  return { buffer, wasProcessed: true };
}

module.exports = { removeBackground };
