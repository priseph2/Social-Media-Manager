'use strict';

/**
 * Extracts readable text from a URL (YouTube video or web article).
 * Returns { title, text, source, url } where text is trimmed to ≤8 000 chars.
 */
async function extractFromUrl(url) {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, '');

  if (host === 'youtube.com' || host === 'youtu.be') {
    return _extractFromYouTube(url, parsed, host);
  }
  return _extractFromArticle(url);
}

async function _extractFromYouTube(url, parsed, host) {
  let videoId;
  if (host === 'youtu.be') {
    videoId = parsed.pathname.slice(1).split('/')[0];
  } else if (parsed.pathname.startsWith('/shorts/')) {
    videoId = parsed.pathname.split('/shorts/')[1]?.split('/')[0];
  } else {
    videoId = parsed.searchParams.get('v');
  }

  if (!videoId) throw new Error('Could not extract YouTube video ID from URL');

  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    signal: AbortSignal.timeout(15000),
  });

  if (!pageRes.ok) throw new Error(`YouTube page returned HTTP ${pageRes.status}`);

  const html = await pageRes.text();

  // Try to extract title
  const titleMatch = html.match(/<title[^>]*>(.*?) - YouTube<\/title>/i);
  const title = titleMatch ? _htmlDecode(titleMatch[1]) : `YouTube Video (${videoId})`;

  // Look for caption tracks embedded in page JSON
  const captionMatch = html.match(/"captionTracks":(\[.*?\])/);
  if (!captionMatch) {
    // No captions — return title as minimal content so caller can still attempt generation
    return { title, text: title, source: 'youtube_title_only', url };
  }

  let captionTracks;
  try { captionTracks = JSON.parse(captionMatch[1]); } catch {
    return { title, text: title, source: 'youtube_title_only', url };
  }

  // Prefer English auto-generated, then English manual, then first available
  const pick = (
    captionTracks.find((t) => t.languageCode === 'en' && t.kind === 'asr') ||
    captionTracks.find((t) => t.languageCode === 'en') ||
    captionTracks[0]
  );

  if (!pick?.baseUrl) {
    return { title, text: title, source: 'youtube_title_only', url };
  }

  const capRes = await fetch(pick.baseUrl, { signal: AbortSignal.timeout(10000) });
  if (!capRes.ok) throw new Error(`Caption XML fetch returned HTTP ${capRes.status}`);

  const xml = await capRes.text();
  const textParts = xml.match(/<text[^>]*>([\s\S]*?)<\/text>/g) || [];
  const text = textParts
    .map((t) => t.replace(/<text[^>]*>/, '').replace(/<\/text>/, ''))
    .map(_htmlDecode)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);

  return { title, text: text || title, source: 'youtube_transcript', url };
}

async function _extractFromArticle(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Article fetch returned HTTP ${res.status}`);

  const html = await res.text();

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? _htmlDecode(titleMatch[1]).replace(/\s+/g, ' ').trim() : url;

  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s>][\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s>][\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s>][\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s>][\s\S]*?<\/aside>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);

  return { title, text: text || title, source: 'article', url };
}

function _htmlDecode(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

module.exports = { extractFromUrl };
