'use strict';

const logger = require('../../utils/logger');

/**
 * Extracts the hook — the first compelling sentence or fragment — from a
 * social caption.  Strips hashtags, @mentions, and URLs, then takes the
 * first sentence (up to . ! ? or a double-newline).  Truncated to 120 chars
 * so it fits cleanly on 2-3 lines of overlay text.
 */
function extractHook(captionText) {
  if (!captionText) return '';
  const cleaned = captionText
    .replace(/https?:\/\/\S+/g, '')       // URLs
    .replace(/[#@]\w+/g, '')              // hashtags & @mentions
    .replace(/\*+/g, '')                  // markdown bold/italic asterisks
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Take up to the first sentence-ending punctuation or paragraph break
  const match = cleaned.match(/^(.+?[.!?])(?:\s|$)/s);
  const hook = match ? match[1].trim() : cleaned.split('\n')[0].trim();
  return hook.slice(0, 120);
}

/**
 * Wraps text into lines no longer than `maxChars` characters.
 * Returns at most `maxLines` lines.
 */
function wrapText(text, maxChars, maxLines = 3) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

/** Escape characters that would break SVG XML. */
function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Composites brand overlays onto a generated image buffer.
 *
 * Layout:
 *   • Logo (transparent PNG) — top-left corner for immediate brand recognition
 *   • Dark gradient — bottom 36 % of frame for text contrast
 *   • Hook text  — large bold white text inside the gradient
 *   • Website URL — small white text, bottom-right of gradient
 *
 * Returns the original buffer unchanged if sharp is unavailable or nothing
 * to overlay.
 *
 * @param {Buffer} imageBuffer
 * @param {object} brandConfig  - brand_configs.config
 * @param {string} [hookText]   - first compelling line of the caption
 * @returns {Promise<Buffer>}
 */
async function addBrandOverlay(imageBuffer, brandConfig, hookText = '') {
  const logoUrl = brandConfig.identity?.logoUrl;
  const website = brandConfig.identity?.website;

  if (!logoUrl && !website && !hookText) return imageBuffer;

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

    // ── Logo — top-left ───────────────────────────────────────────────────────
    if (logoUrl) {
      try {
        const fetchFn = globalThis.fetch ?? (await import('node-fetch').catch(() => ({}))).default;
        if (fetchFn) {
          const res = await fetchFn(logoUrl, { signal: AbortSignal.timeout(8000) });
          if (res.ok) {
            const logoBuf = Buffer.from(await res.arrayBuffer());
            const maxH = Math.max(36, Math.round(height * 0.10));
            const resized = await sharp(logoBuf)
              .resize({ height: maxH, fit: 'inside' })
              .png()
              .toBuffer();
            const pad = Math.round(width * 0.025);
            composites.push({ input: resized, left: pad, top: pad });
          }
        }
      } catch (err) {
        logger.warn('[BrandOverlay] Logo overlay failed', { error: err.message });
      }
    }

    // ── Bottom gradient + hook text + website ─────────────────────────────────
    const hasBottomContent = hookText || website;
    if (hasBottomContent) {
      const gradientH = Math.round(height * 0.36);

      // Font sizes
      const hookSize  = Math.max(26, Math.round(height * 0.044)); // ~45px @ 1024
      const siteSize  = Math.max(13, Math.round(height * 0.022)); // ~22px @ 1024
      const lineH     = Math.round(hookSize * 1.35);
      const padX      = Math.round(width  * 0.05);
      const padBottom = Math.round(height * 0.03);

      // Wrap hook text
      const maxCharsPerLine = Math.floor((width - padX * 2) / (hookSize * 0.55));
      const hookLines = hookText ? wrapText(hookText, maxCharsPerLine, 3) : [];
      const totalTextH = hookLines.length * lineH + (website ? siteSize + 8 : 0);

      // Y position for first hook line — anchor text block near bottom
      const textBlockTop = gradientH - padBottom - totalTextH;
      let currentY = textBlockTop + hookSize;

      // Build hook text elements
      const hookSvgLines = hookLines.map((line) => {
        const y = currentY;
        currentY += lineH;
        return (
          `<text x="${width / 2}" y="${y}" text-anchor="middle" ` +
          `font-family="Arial Black,Arial,Helvetica,sans-serif" font-size="${hookSize}" font-weight="900" ` +
          `fill="white" filter="url(#shadow)">${esc(line)}</text>`
        );
      });

      // Website URL — bottom-right, smaller
      const websiteLine = website
        ? (() => {
            const displayUrl = website.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 45);
            const y = currentY + siteSize;
            return (
              `<text x="${width - padX}" y="${y}" text-anchor="end" ` +
              `font-family="Arial,Helvetica,sans-serif" font-size="${siteSize}" ` +
              `fill="white" opacity="0.80">${esc(displayUrl)}</text>`
            );
          })()
        : '';

      const svg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${gradientH}">` +
          `<defs>` +
            `<linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">` +
              `<stop offset="0%"   stop-color="#000000" stop-opacity="0"/>` +
              `<stop offset="45%"  stop-color="#000000" stop-opacity="0.45"/>` +
              `<stop offset="100%" stop-color="#000000" stop-opacity="0.80"/>` +
            `</linearGradient>` +
            `<filter id="shadow" x="-5%" y="-5%" width="110%" height="130%">` +
              `<feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.7"/>` +
            `</filter>` +
          `</defs>` +
          `<rect width="${width}" height="${gradientH}" fill="url(#grad)"/>` +
          hookSvgLines.join('') +
          websiteLine +
        `</svg>`
      );

      composites.push({ input: svg, left: 0, top: height - gradientH });
    }

    if (composites.length === 0) return imageBuffer;
    return await img.composite(composites).png().toBuffer();
  } catch (err) {
    logger.warn('[BrandOverlay] Overlay compositing failed — returning original', { error: err.message });
    return imageBuffer;
  }
}

module.exports = { addBrandOverlay, extractHook };
