'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getSupabaseClient } = require('../../services/database/supabase-client');
const { removeBackground } = require('../../services/background-removal');
const logger = require('../../utils/logger');

const router = express.Router();
router.use(authenticate);

const PRODUCT_IMAGES_BUCKET = 'product-images';

/**
 * POST /api/media/product-image
 *
 * Upload a product image as raw binary (Content-Type: image/*).
 * The image is stored in Supabase Storage; if REMOVEBG_API_KEY is configured
 * the background is automatically removed and the transparent PNG is stored
 * and returned instead.
 *
 * Request headers:
 *   Content-Type: image/jpeg | image/png | image/webp
 *   Authorization: Bearer <token>
 *
 * Response: { url: string, wasBackgroundRemoved: boolean }
 */
router.post(
  '/product-image',
  express.raw({ type: /^image\//, limit: '10mb' }),
  async (req, res, next) => {
    try {
      if (!req.tenantId) return res.status(400).json({ error: 'No tenant context' });

      const imageBuffer = req.body;
      if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
        return res.status(400).json({
          error: 'Image body required — send raw binary with Content-Type: image/jpeg, image/png, or image/webp',
        });
      }

      const mimeType = req.headers['content-type']?.split(';')[0]?.trim() || 'image/jpeg';
      const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';

      const db = getSupabaseClient();
      if (!db) return res.status(503).json({ error: 'Database unavailable' });

      const timestamp = Date.now();

      // Upload raw image first so remove.bg can fetch it via its public URL
      const rawPath = `${req.tenantId}/raw/${timestamp}.${ext}`;
      const { error: rawErr } = await db.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(rawPath, imageBuffer, { contentType: mimeType, upsert: true });

      if (rawErr) {
        logger.error('[Media] Raw image upload failed', { error: rawErr.message });
        throw new Error(`Storage upload failed: ${rawErr.message}`);
      }

      const { data: rawData } = db.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(rawPath);
      const rawUrl = rawData.publicUrl;

      // Attempt background removal
      let finalUrl = rawUrl;
      let wasBackgroundRemoved = false;

      try {
        const { buffer: processedBuffer, wasProcessed } = await removeBackground(rawUrl);
        if (wasProcessed && processedBuffer) {
          const processedPath = `${req.tenantId}/processed/${timestamp}.png`;
          const { error: procErr } = await db.storage
            .from(PRODUCT_IMAGES_BUCKET)
            .upload(processedPath, processedBuffer, { contentType: 'image/png', upsert: true });

          if (!procErr) {
            const { data: procData } = db.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(processedPath);
            finalUrl = procData.publicUrl;
            wasBackgroundRemoved = true;
            logger.info('[Media] Product image processed with background removal', { tenantId: req.tenantId });
          } else {
            logger.warn('[Media] Processed image upload failed — using raw', { error: procErr.message });
          }
        }
      } catch (bgErr) {
        logger.warn('[Media] Background removal failed — returning raw image', { error: bgErr.message });
      }

      res.json({ url: finalUrl, wasBackgroundRemoved });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
