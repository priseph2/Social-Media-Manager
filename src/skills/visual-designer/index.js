'use strict';

const BaseSkill = require('../base-skill');
const Content = require('../../models/content.model');
const { getSupabaseClient } = require('../../services/database/supabase-client');
const { getImageAdapter } = require('../../services/image-generation');
const { buildImagePrompt } = require('./prompt-builder');
const { recordImageUsage } = require('../../services/billing/usage-meter');
const { PLATFORM_ASPECT_RATIOS } = require('../../services/image-generation/base-adapter');
const logger = require('../../utils/logger');

const STORAGE_BUCKET = 'generated-images';

class VisualDesigner extends BaseSkill {
  constructor() {
    super('visual-designer');
  }

  async execute(job) {
    const { contentId, tenantId, platform } = job.data;

    if (!contentId || !tenantId) {
      throw new Error('visual-designer job missing contentId or tenantId');
    }

    try {
      // 1. Load content document
      const content = await Content.findById(contentId);
      if (!content) {
        this.log.warn('Content not found — skipping image generation', { contentId });
        return { skipped: true, reason: 'content_not_found' };
      }

      if (content.brandReview?.status !== 'approved') {
        this.log.info('Content not approved — skipping image generation', { contentId, status: content.brandReview?.status });
        return { skipped: true, reason: 'not_approved' };
      }

      // 2. Load brand config
      const brandConfig = await this._getBrandConfig(tenantId);

      // 3. Build prompt from approved variation text
      const effectivePlatform = platform || content.platform || 'default';
      const captionText = content.variations[content.selectedVariation ?? 0]?.text || '';
      const prompt = buildImagePrompt(captionText, effectivePlatform, brandConfig);

      this.log.info('Generating image', { contentId, platform: effectivePlatform, provider: 'resolving...' });

      // 4. Get provider adapter and generate image
      const adapter = await getImageAdapter(tenantId);
      const { imageBuffer, model, costUsd } = await adapter.generate(prompt, effectivePlatform);

      // 5. Upload to Supabase Storage
      const imageUrl = await this._uploadImage(tenantId, contentId, imageBuffer);

      // 6. Update content document with image fields
      const aspectRatio = PLATFORM_ASPECT_RATIOS[effectivePlatform] || '1:1';
      await Content.findByIdAndUpdate(contentId, {
        imageUrl,
        imageModel: model,
        imageAspectRatio: aspectRatio,
        imageStatus: 'generated',
      });

      // 7. Record image usage (fire-and-forget)
      recordImageUsage(tenantId, model, costUsd, 'visual-designer');

      this.log.info('Image generated successfully', { contentId, imageUrl, model, costUsd });
      return { imageUrl, model, contentId, costUsd };
    } catch (err) {
      // Mark as failed so the UI doesn't stay stuck on 'generating'
      await Content.findByIdAndUpdate(contentId, { imageStatus: 'failed' }).catch(() => {});
      this.log.error('Image generation failed', { contentId, error: err.message });
      throw err;
    }
  }

  async _getBrandConfig(tenantId) {
    const db = getSupabaseClient();
    if (!db) return {};
    const { data } = await db
      .from('brand_configs')
      .select('config')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();
    return data?.config || {};
  }

  async _uploadImage(tenantId, contentId, buffer) {
    const db = getSupabaseClient();
    if (!db) throw new Error('Supabase not available for image storage');

    const timestamp = Date.now();
    const path = `${tenantId}/${contentId}/${timestamp}.png`;

    const { error } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(path, buffer, { contentType: 'image/png', upsert: true });

    if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);

    const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }
}

module.exports = VisualDesigner;
