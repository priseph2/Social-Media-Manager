'use strict';

class ImageAdapter {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Generate an image from a text prompt.
   *
   * @param {string} prompt   - Detailed image generation prompt
   * @param {string} platform - Target platform (instagram, facebook, twitter, etc.)
   * @returns {Promise<{ imageBuffer: Buffer, model: string, costUsd: number }>}
   */
  async generate(prompt, platform) {
    throw new Error('ImageAdapter.generate() not implemented');
  }
}

// Platform → aspect ratio (Imagen 4 native)
const PLATFORM_ASPECT_RATIOS = {
  instagram:        '4:5',
  instagram_story:  '9:16',
  instagram_reel:   '9:16',
  facebook:         '16:9',
  twitter:          '16:9',
  linkedin:         '4:3',
  tiktok:           '9:16',
  pinterest:        '2:3',
  default:          '1:1',
};

// Platform → DALL-E size (limited options: 1:1, 9:16, 16:9)
const PLATFORM_DALLE_SIZES = {
  instagram:        '1024x1024',
  instagram_story:  '1024x1792',
  instagram_reel:   '1024x1792',
  facebook:         '1792x1024',
  twitter:          '1792x1024',
  linkedin:         '1792x1024',
  tiktok:           '1024x1792',
  pinterest:        '1024x1792',
  default:          '1024x1024',
};

module.exports = { ImageAdapter, PLATFORM_ASPECT_RATIOS, PLATFORM_DALLE_SIZES };
