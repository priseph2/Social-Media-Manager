'use strict';

const { ImageAdapter, PLATFORM_DALLE_SIZES } = require('../base-adapter');

const COST_PER_IMAGE = {
  'dalle3-standard': 0.04,
  'dalle3-hd':       0.08,
};

class DalleAdapter extends ImageAdapter {
  constructor(providerKey = 'dalle3-standard') {
    super();
    this.providerKey = providerKey;
    this.quality = providerKey === 'dalle3-hd' ? 'hd' : 'standard';
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  async generate(prompt, platform) {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is not configured');

    const size = PLATFORM_DALLE_SIZES[platform] || PLATFORM_DALLE_SIZES.default;

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
        quality: this.quality,
        response_format: 'b64_json',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DALL-E 3 API error ${res.status}: ${text}`);
    }

    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error('DALL-E 3 returned no image data');

    return {
      imageBuffer: Buffer.from(b64, 'base64'),
      model: this.providerKey,
      costUsd: COST_PER_IMAGE[this.providerKey] ?? 0.04,
    };
  }
}

module.exports = DalleAdapter;
