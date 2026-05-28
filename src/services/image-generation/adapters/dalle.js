'use strict';

const { ImageAdapter } = require('../base-adapter');

// Size mappings for gpt-image-1 (1024x1024 / 1024x1536 / 1536x1024 only)
const GPT_IMAGE_SIZES = {
  instagram:        '1024x1024',
  instagram_story:  '1024x1536',
  instagram_reel:   '1024x1536',
  facebook:         '1536x1024',
  twitter:          '1536x1024',
  linkedin:         '1536x1024',
  tiktok:           '1024x1536',
  pinterest:        '1024x1536',
  default:          '1024x1024',
};

// Size mappings for legacy dall-e-3
const DALLE3_SIZES = {
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

const COST_PER_IMAGE = {
  'dalle3-standard': 0.04,
  'dalle3-hd':       0.08,
};

class DalleAdapter extends ImageAdapter {
  constructor(providerKey = 'dalle3-standard') {
    super();
    this.providerKey = providerKey;
    this.apiKey = process.env.OPENAI_API_KEY;
    // gpt-image-1 quality mapping (low/medium/high)
    this.gptQuality = providerKey === 'dalle3-hd' ? 'high' : 'medium';
    // dall-e-3 quality mapping (standard/hd)
    this.dalle3Quality = providerKey === 'dalle3-hd' ? 'hd' : 'standard';
  }

  async generate(prompt, platform) {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is not configured');

    // Try gpt-image-1 first (new default for most OpenAI API keys),
    // fall back to dall-e-3 if the key doesn't have gpt-image-1 access.
    try {
      return await this._generateGptImage1(prompt, platform);
    } catch (err) {
      if (err.message.includes('does not exist') || err.message.includes('not found') || err.message.includes('invalid_value')) {
        return await this._generateDalle3(prompt, platform);
      }
      throw err;
    }
  }

  async _generateGptImage1(prompt, platform) {
    const size = GPT_IMAGE_SIZES[platform] || GPT_IMAGE_SIZES.default;

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size,
        quality: this.gptQuality,
      }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json?.error?.message || `gpt-image-1 error ${res.status}`);
    }

    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error('gpt-image-1 returned no image data');

    return {
      imageBuffer: Buffer.from(b64, 'base64'),
      model: `gpt-image-1(${this.gptQuality})`,
      costUsd: COST_PER_IMAGE[this.providerKey] ?? 0.04,
    };
  }

  async _generateDalle3(prompt, platform) {
    const size = DALLE3_SIZES[platform] || DALLE3_SIZES.default;

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
        quality: this.dalle3Quality,
        // response_format omitted — returns URL, downloaded below
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DALL-E 3 error ${res.status}: ${text}`);
    }

    const json = await res.json();
    const imageUrl = json?.data?.[0]?.url;
    if (!imageUrl) throw new Error('DALL-E 3 returned no image URL');

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`DALL-E 3 image download failed: ${imgRes.status}`);

    return {
      imageBuffer: Buffer.from(await imgRes.arrayBuffer()),
      model: `dalle3(${this.dalle3Quality})`,
      costUsd: COST_PER_IMAGE[this.providerKey] ?? 0.04,
    };
  }
}

module.exports = DalleAdapter;
