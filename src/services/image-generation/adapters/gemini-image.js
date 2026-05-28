'use strict';

const { ImageAdapter } = require('../base-adapter');

// Gemini image generation — works on the free Google AI Studio tier.
// Tries model names in order; available models vary by API key tier.
// List reflects models discovered via ModelService.ListModels — image-specific
// ones first, then general-purpose flash models that support image output.
const CANDIDATE_MODELS = [
  'gemini-3.1-flash-image',               // latest image model (2025)
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image',
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
  'gemini-2.0-flash-exp',                 // first to support image generation
  'gemini-2.0-flash',
  'gemini-2.5-flash',
];

const COST_PER_IMAGE = 0.01; // approximate

class GeminiImageAdapter extends ImageAdapter {
  constructor() {
    super();
    this.apiKey = process.env.GOOGLE_API_KEY;
  }

  async generate(prompt, platform) {
    if (!this.apiKey) throw new Error('GOOGLE_API_KEY is not configured');

    let lastError;
    for (const model of CANDIDATE_MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
          }),
        });
      } catch (e) {
        lastError = e;
        continue;
      }

      // 404 = model doesn't exist on this key → try next candidate
      if (res.status === 404) {
        lastError = new Error(`model ${model} not found`);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Gemini image API error ${res.status}: ${text}`);
      }

      const json = await res.json();
      const parts = json?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith('image/'));
      if (!imagePart?.inlineData?.data) {
        throw new Error('Gemini returned no image data');
      }

      return {
        imageBuffer: Buffer.from(imagePart.inlineData.data, 'base64'),
        model: `gemini-image(${model})`,
        costUsd: COST_PER_IMAGE,
      };
    }

    throw lastError || new Error('No working Gemini image model found for this API key');
  }
}

module.exports = GeminiImageAdapter;
