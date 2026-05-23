'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const BrandGuardian = require('../../skills/brand-guardian/brand-guardian');
const ContentGenerator = require('../../skills/content-generator/content-generator');

const router = Router();
router.use(authenticate);

const brandGuardian = new BrandGuardian();
const contentGenerator = new ContentGenerator();

/**
 * POST /api/content/review
 * Synchronously review a piece of content for brand compliance.
 * Body: { content, type, platform? }
 */
router.post('/review', async (req, res, next) => {
  try {
    const { content, type, platform } = req.body;
    if (!content || !type) return res.status(400).json({ error: 'content and type are required' });
    const result = await brandGuardian.reviewSync({ content, type, platform });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/content/generate
 * Synchronously generate a single piece of content.
 * Body: { type: 'social_caption'|'product_description'|..., ...options }
 *
 * For production use, prefer the async queue via /api/orchestrator/generate-content.
 */
router.post('/generate', async (req, res, next) => {
  try {
    const fakeJob = { id: `api-${Date.now()}`, name: 'generate-content', data: req.body };
    const result = await contentGenerator.execute(fakeJob);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
