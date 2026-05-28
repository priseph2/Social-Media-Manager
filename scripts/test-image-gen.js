'use strict';

/**
 * Standalone image generation smoke test.
 * Usage:  node scripts/test-image-gen.js
 * Requires GOOGLE_API_KEY (or OPENAI_API_KEY) in .env or environment.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const GOOGLE_KEY = process.env.GOOGLE_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const PROMPT = 'A clean, modern social media banner for a coffee brand. Warm tones, minimalist style, steam rising from a white ceramic cup on a wooden table. Photorealistic.';

// ── Google model discovery ───────────────────────────────────────────────────

async function listGoogleImageModels() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GOOGLE_KEY}&pageSize=200`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.models || [])
    .filter((m) => {
      const methods = m.supportedGenerationMethods || [];
      const name = m.name.toLowerCase();
      // Only keep models that explicitly mention "image" or "imagen" in the name
      // (avoids picking up TTS, thinking, or pure-text flash variants)
      return methods.includes('generateContent') &&
        (name.includes('imagen') || name.includes('-image'));
    })
    .map((m) => m.name.replace('models/', ''));
}

// ── Gemini image generation ──────────────────────────────────────────────────

async function testGeminiImage() {
  console.log('\n── Gemini Image (Google — free tier) ──────────────');
  if (!GOOGLE_KEY) { console.log('SKIP — GOOGLE_API_KEY not set'); return false; }

  const candidates = [
    'gemini-2.0-flash-exp',
    'gemini-2.0-flash-preview-image-generation',
    'gemini-2.0-flash',
  ];

  // Auto-discover if candidates fail
  console.log('Discovering available image models…');
  const discovered = await listGoogleImageModels().catch(() => []);
  if (discovered.length) {
    console.log('Available models:', discovered.join(', '));
    for (const m of discovered) {
      if (!candidates.includes(m)) candidates.unshift(m);
    }
  }

  for (const model of candidates) {
    process.stdout.write(`Trying ${model}… `);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_KEY}`;

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: PROMPT }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      });
    } catch (e) { console.log(`network error: ${e.message}`); continue; }

    if (res.status === 404) { console.log('not found — trying next'); continue; }

    if (!res.ok) {
      const text = await res.text();
      console.log(`FAIL HTTP ${res.status}: ${text.slice(0, 200)}`);
      return false;
    }

    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imagePart?.inlineData?.data) {
      console.log('FAIL — no image in response:', JSON.stringify(json).slice(0, 300));
      return false;
    }

    const buf = Buffer.from(imagePart.inlineData.data, 'base64');
    const outPath = path.join(__dirname, '..', 'test-gemini-image.png');
    fs.writeFileSync(outPath, buf);
    console.log(`PASS ✓  (${Math.round(buf.length / 1024)} KB) → ${outPath}`);
    console.log(`  Working model: ${model}`);
    return true;
  }

  console.log('FAIL — no working Gemini image model found on this key');
  return false;
}

// ── Imagen 4 ─────────────────────────────────────────────────────────────────

async function testImagen4() {
  console.log('\n── Imagen 4 Fast (Google — requires paid billing) ─');
  if (!GOOGLE_KEY) { console.log('SKIP — GOOGLE_API_KEY not set'); return false; }

  const model = 'imagen-4.0-fast-generate-001';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${GOOGLE_KEY}`;

  process.stdout.write(`Calling ${model}… `);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: PROMPT }],
      parameters: { sampleCount: 1, aspectRatio: '16:9', safetyFilterLevel: 'BLOCK_SOME' },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    const json = JSON.parse(text);
    if (res.status === 429) { console.log(`SKIP (billing: ${json?.error?.message?.slice(0, 80)})`); return false; }
    if (res.status === 400 && json?.error?.message?.includes('paid')) { console.log(`SKIP (requires paid billing)`); return false; }
    console.log(`FAIL HTTP ${res.status}: ${text.slice(0, 200)}`);
    return false;
  }

  const json = await res.json();
  const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) { console.log('FAIL — no image data'); return false; }

  const buf = Buffer.from(b64, 'base64');
  const outPath = path.join(__dirname, '..', 'test-imagen4.png');
  fs.writeFileSync(outPath, buf);
  console.log(`PASS ✓  (${Math.round(buf.length / 1024)} KB) → ${outPath}`);
  return true;
}

// ── OpenAI (gpt-image-1 with dall-e-3 fallback) ──────────────────────────────

async function testOpenAI() {
  console.log('\n── OpenAI Image Generation ───────────────────────');
  if (!OPENAI_KEY) { console.log('SKIP — OPENAI_API_KEY not set'); return false; }

  // Try gpt-image-1 first (newer default), fall back to dall-e-3
  const configs = [
    { model: 'gpt-image-1', size: '1536x1024', extra: { quality: 'medium' } },
    { model: 'dall-e-3',    size: '1792x1024', extra: { quality: 'standard' } },
  ];

  for (const { model, size, extra } of configs) {
    process.stdout.write(`Trying ${model}… `);

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: PROMPT, n: 1, size, ...extra }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const msg = json?.error?.message || `HTTP ${res.status}`;
      if (msg.includes('does not exist') || msg.includes('not found')) {
        console.log(`not available — trying next`);
        continue;
      }
      console.log(`FAIL: ${msg.slice(0, 120)}`);
      return false;
    }

    const json = await res.json();

    // gpt-image-1 returns b64_json; dall-e-3 returns a URL
    const b64 = json?.data?.[0]?.b64_json;
    const imageUrl = json?.data?.[0]?.url;

    let buf;
    if (b64) {
      buf = Buffer.from(b64, 'base64');
    } else if (imageUrl) {
      process.stdout.write('downloading… ');
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) { console.log(`FAIL download ${imgRes.status}`); return false; }
      buf = Buffer.from(await imgRes.arrayBuffer());
    } else {
      console.log('FAIL — no image in response:', JSON.stringify(json).slice(0, 200));
      return false;
    }

    const outPath = path.join(__dirname, '..', 'test-openai-image.png');
    fs.writeFileSync(outPath, buf);
    console.log(`PASS ✓  (${Math.round(buf.length / 1024)} KB) → ${outPath}`);
    console.log(`  Working model: ${model}`);
    return true;
  }

  console.log('FAIL — no working OpenAI image model found on this key');
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log('Image Generation Smoke Test');
  console.log('============================');
  console.log(`GOOGLE_API_KEY : ${GOOGLE_KEY ? 'SET (' + GOOGLE_KEY.slice(0, 8) + '…)' : 'NOT SET'}`);
  console.log(`OPENAI_API_KEY : ${OPENAI_KEY ? 'SET (' + OPENAI_KEY.slice(0, 8) + '…)' : 'NOT SET'}`);

  if (!GOOGLE_KEY && !OPENAI_KEY) {
    console.error('\nNo API keys configured. Set GOOGLE_API_KEY or OPENAI_API_KEY in .env');
    process.exit(1);
  }

  const g = await testGeminiImage().catch((e) => { console.error('ERROR:', e.message); return false; });
  const i = await testImagen4().catch((e) => { console.error('ERROR:', e.message); return false; });
  const d = await testOpenAI().catch((e) => { console.error('ERROR:', e.message); return false; });

  console.log('\n============================');
  const working = [g && 'Gemini Image', i && 'Imagen 4', d && 'OpenAI'].filter(Boolean);
  if (!working.length) { console.error('RESULT: All providers failed.'); process.exit(1); }
  console.log(`RESULT: ${working.join(' + ')} working ✓`);
})();
