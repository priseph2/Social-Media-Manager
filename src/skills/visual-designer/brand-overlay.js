'use strict';

const logger = require('../../utils/logger');

/**
 * Composites brand overlays (logo + website URL) onto a generated image buffer.
 * Returns the original buffer unchanged if sharp is unavailable or no overlays are configured.
 *
 * @param {Buffer} imageBuffer
 * @param {{ identity?: { logoUrl?: string; website?: string } }} brandConfig
 * @returns {Promise<Buffer>}
 */
async function addBrandOverlay(imageBuffer, brandConfig) {
  const logoUrl = brandConfig.identity?.logoUrl;
  const website = brandConfig.identity?.website;
  if (!logoUrl && !website) return imageBuffer;

  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    logger.warn('[BrandOverlay] sharp not available — skipping overlay');
    return imageBuffer;
  }

  try {
    const img = sharp(imageBuffer);
    const { width, height } = await img.metadata();
    const composites = [];

    // ── Logo — bottom-right corner ────────────────────────────────────────────
    if (logoUrl) {
      try {
        const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
        const res = await fetch(logoUrl, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const logoBuf = Buffer.from(await res.arrayBuffer());
          const maxH = Math.max(32, Math.round(height * 0.09));
          const resized = await sharp(logoBuf).resize({ height: maxH, fit: 'inside' }).png().toBuffer();
          const { width: lw, height: lh } = await sharp(resized).metadata();
          const pad = Math.round(width * 0.02);
          composites.push({ input: resized, left: width - lw - pad, top: height - lh - pad });
        }
      } catch (err) {
        logger.warn('[BrandOverlay] Logo overlay failed', { error: err.message });
      }
    }

    // ── Website URL — bottom-left strip ──────────────────────────────────────
    if (website) {
      const displayUrl = website.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 50);
      const fontSize = Math.max(14, Math.round(height * 0.026));
      const stripH = Math.round(fontSize * 1.8);
      const pad = Math.round(fontSize * 0.6);

      const svg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${stripH}">` +
        `<rect width="${width}" height="${stripH}" fill="rgba(0,0,0,0.45)" rx="0"/>` +
        `<text x="${pad}" y="${Math.round(stripH * 0.72)}" ` +
        `font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" ` +
        `fill="white" opacity="0.92">${displayUrl}</text>` +
        `</svg>`
      );

      composites.push({ input: svg, left: 0, top: height - stripH });
    }

    if (composites.length === 0) return imageBuffer;
    return await img.composite(composites).png().toBuffer();
  } catch (err) {
    logger.warn('[BrandOverlay] Overlay compositing failed — returning original', { error: err.message });
    return imageBuffer;
  }
}

module.exports = { addBrandOverlay };
