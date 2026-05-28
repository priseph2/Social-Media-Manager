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

async function testGeminiImage() {
  console.log('\n── Gemini Image (Google — free tier) ──────────────');
  if (!GOOGLE_KEY) { console.log('SKIP — GOOGLE_API_KEY not set'); return false; }

  const model = 'gemini-2.0-flash-preview-image-generation';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_KEY}`;

  console.log(`Calling ${model}…`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: PROMPT }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`FAIL — HTTP ${res.status}: ${text}`);
    return false;
  }

  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart?.inlineData?.data) {
    console.error('FAIL — No image data in response:', JSON.stringify(json).slice(0, 400));
    return false;
  }

  const buf = Buffer.from(imagePart.inlineData.data, 'base64');
  const outPath = path.join(__dirname, '..', 'test-gemini-image.png');
  fs.writeFileSync(outPath, buf);
  console.log(`PASS ✓ Image saved → ${outPath}  (${Math.round(buf.length / 1024)} KB)`);
  return true;
}

async function testImagen4() {
  console.log('\n── Imagen 4 Fast (Google — requires paid billing) ─');
  if (!GOOGLE_KEY) { console.log('SKIP — GOOGLE_API_KEY not set'); return false; }

  const model = 'imagen-4.0-fast-generate-001';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${GOOGLE_KEY}`;

  console.log(`Calling ${model}…`);
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
    console.error(`FAIL — HTTP ${res.status}: ${text}`);
    return false;
  }

  const json = await res.json();
  const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) { console.error('FAIL — No image data in response:', JSON.stringify(json).slice(0, 300)); return false; }

  const buf = Buffer.from(b64, 'base64');
  const outPath = path.join(__dirname, '..', 'test-imagen4.png');
  fs.writeFileSync(outPath, buf);
  console.log(`PASS ✓ Image saved → ${outPath}  (${Math.round(buf.length / 1024)} KB)`);
  return true;
}

async function testDalle3() {
  console.log('\n── DALL-E 3 (OpenAI) ─────────────────────────────');
  if (!OPENAI_KEY) { console.log('SKIP — OPENAI_API_KEY not set'); return false; }

  console.log('Calling dall-e-3…');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: PROMPT,
      n: 1,
      size: '1792x1024',
      quality: 'standard',
      // response_format omitted — returns URL, then we download
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`FAIL — HTTP ${res.status}: ${text}`);
    return false;
  }

  const json = await res.json();
  const imageUrl = json?.data?.[0]?.url;
  if (!imageUrl) { console.error('FAIL — No image URL in response'); return false; }

  console.log('Downloading image…');
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) { console.error(`FAIL — Download error ${imgRes.status}`); return false; }

  const buf = Buffer.from(await imgRes.arrayBuffer());
  const outPath = path.join(__dirname, '..', 'test-dalle3.png');
  fs.writeFileSync(outPath, buf);
  console.log(`PASS ✓ Image saved → ${outPath}  (${Math.round(buf.length / 1024)} KB)`);
  return true;
}

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
  const d = await testDalle3().catch((e) => { console.error('ERROR:', e.message); return false; });

  console.log('\n============================');
  const working = [g && 'Gemini Image', i && 'Imagen 4', d && 'DALL-E 3'].filter(Boolean);
  if (!working.length) { console.error('RESULT: All providers failed.'); process.exit(1); }
  console.log(`RESULT: ${working.join(' + ')} working ✓`);
})();
