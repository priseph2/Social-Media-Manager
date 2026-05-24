'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { checkOpsLimit } = require('../middleware/plan-gate');
const BrandGuardian = require('../../skills/brand-guardian/brand-guardian');
const ContentGenerator = require('../../skills/content-generator/content-generator');
const { localiseContent } = require('../../skills/content-generator/localiser');
const { getBrandConfig } = require('../../services/brand-config');

const router = Router();
router.use(authenticate);

const brandGuardian = new BrandGuardian();
const contentGenerator = new ContentGenerator();

const SUPPORTED_LANGUAGES = { fr: 'French', sw: 'Swahili', yo: 'Yoruba', ar: 'Arabic' };

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
    const fakeJob = { id: `api-${Date.now()}`, name: 'generate-content', data: { ...req.body, tenantId: req.tenantId } };
    const result = await contentGenerator.execute(fakeJob);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/content/localise
 * Localise content into one or more languages (fr, sw, yo, ar).
 * Body: { content, targetLanguages, contentType?, platform? }
 */
router.post('/localise', checkOpsLimit, async (req, res, next) => {
  try {
    const { content, targetLanguages, contentType, platform } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });
    if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
      return res.status(400).json({ error: 'targetLanguages must be a non-empty array', supported: Object.keys(SUPPORTED_LANGUAGES) });
    }
    const invalid = targetLanguages.filter((l) => !SUPPORTED_LANGUAGES[l]);
    if (invalid.length) {
      return res.status(400).json({ error: `Unsupported languages: ${invalid.join(', ')}`, supported: Object.keys(SUPPORTED_LANGUAGES) });
    }
    const brandConfig = await getBrandConfig(req.tenantId || null);
    const result = await localiseContent(content, targetLanguages, brandConfig, contentType || 'social_caption', platform);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/content/languages
 * Lists supported localisation languages.
 */
router.get('/languages', (req, res) => {
  res.json({ supported: SUPPORTED_LANGUAGES });
});

module.exports = router;
