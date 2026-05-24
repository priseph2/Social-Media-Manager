'use strict';

const { ImageAdapter, PLATFORM_ASPECT_RATIOS } = require('../base-adapter');

const IMAGEN_MODELS = {
  'imagen4-fast':     'imagen-4.0-fast-generate-001',
  'imagen4-standard': 'imagen-4.0-generate-001',
};

const COST_PER_IMAGE = {
  'imagen4-fast':     0.02,
  'imagen4-standard': 0.04,
};

class Imagen4Adapter extends ImageAdapter {
  constructor(providerKey = 'imagen4-fast') {
    super();
    this.providerKey = providerKey;
    this.modelId = IMAGEN_MODELS[providerKey] || IMAGEN_MODELS['imagen4-fast'];
    this.apiKey = process.env.GOOGLE_API_KEY;
  }

  async generate(prompt, platform) {
    if (!this.apiKey) throw new Error('GOOGLE_API_KEY is not configured');

    const aspectRatio = PLATFORM_ASPECT_RATIOS[platform] || PLATFORM_ASPECT_RATIOS.default;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}:predict?key=${this.apiKey}`;

    const body = {
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio,
        safetyFilterLevel: 'BLOCK_SOME',
        personGeneration: 'ALLOW_ADULT',
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Imagen 4 API error ${res.status}: ${text}`);
    }

    const json = await res.json();
    const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new Error('Imagen 4 returned no image data');

    return {
      imageBuffer: Buffer.from(b64, 'base64'),
      model: this.providerKey,
      costUsd: COST_PER_IMAGE[this.providerKey] ?? 0.02,
    };
  }
}

module.exports = Imagen4Adapter;
