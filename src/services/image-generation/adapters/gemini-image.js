'use strict';

const { ImageAdapter } = require('../base-adapter');

// Gemini image generation — works on the free Google AI Studio tier.
// Uses gemini-2.0-flash-preview-image-generation which returns inline PNG data.
const GEMINI_MODEL = 'gemini-2.0-flash-preview-image-generation';
const COST_PER_IMAGE = 0.01; // approximate

class GeminiImageAdapter extends ImageAdapter {
  constructor() {
    super();
    this.apiKey = process.env.GOOGLE_API_KEY;
  }

  async generate(prompt, platform) {
    if (!this.apiKey) throw new Error('GOOGLE_API_KEY is not configured');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      }),
    });

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
      model: 'gemini-image',
      costUsd: COST_PER_IMAGE,
    };
  }
}

module.exports = GeminiImageAdapter;
