'use strict';

const logger = require('../../utils/logger');
const { getCredentials } = require('../credential-store');

const BASE_URL = 'https://api.heygen.com';

// Vertical 9:16 for Reels/TikTok; square 1:1 fallback
const DIMENSIONS = {
  vertical: { width: 1080, height: 1920 },
  square:   { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
};

class HeyGenClient {
  constructor(apiKey, defaultAvatarId = null, defaultVoiceId = null) {
    this.apiKey = apiKey;
    this.defaultAvatarId = defaultAvatarId;
    this.defaultVoiceId = defaultVoiceId;
  }

  _headers() {
    return { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' };
  }

  async _request(method, path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: this._headers(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
      return json;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Submit a video generation job to HeyGen.
   * Returns { videoId } — video is generated asynchronously.
   */
  async generateVideo({ script, avatarId, voiceId, orientation = 'vertical', backgroundColour = '#1a1a1a', callbackUrl }) {
    const aid = avatarId || this.defaultAvatarId;
    const vid = voiceId || this.defaultVoiceId;

    if (!aid) throw new Error('HeyGen: no avatarId provided and no default configured');
    if (!vid) throw new Error('HeyGen: no voiceId provided and no default configured');

    const dimension = DIMENSIONS[orientation] || DIMENSIONS.vertical;

    const payload = {
      video_inputs: [{
        character: { type: 'avatar', avatar_id: aid, avatar_style: 'normal' },
        voice:     { type: 'text',   input_text: script.substring(0, 1500), voice_id: vid, speed: 1.0 },
        background: { type: 'color', value: backgroundColour },
      }],
      dimension,
      ...(callbackUrl ? { callback_id: callbackUrl } : {}),
    };

    logger.info('[HeyGen] Submitting video generation', { avatarId: aid, orientation, scriptLength: script.length });
    const data = await this._request('POST', '/v2/video/generate', payload);
    const videoId = data?.data?.video_id || data?.video_id;
    if (!videoId) throw new Error('HeyGen: no video_id in response');
    logger.info('[HeyGen] Video job submitted', { videoId });
    return { videoId };
  }

  /**
   * Poll video status. Returns { status, videoUrl } where status is
   * 'processing' | 'completed' | 'failed'.
   */
  async getVideoStatus(videoId) {
    const data = await this._request('GET', `/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`);
    const d = data?.data;
    return {
      status:   d?.status || 'processing',
      videoUrl: d?.video_url || null,
      error:    d?.error || null,
    };
  }

  /** List available avatars for the account */
  async listAvatars() {
    const data = await this._request('GET', '/v2/avatars');
    return data?.data?.avatars || [];
  }

  /** List available voices */
  async listVoices() {
    const data = await this._request('GET', '/v2/voices');
    return data?.data?.voices || [];
  }
}

// Instance cache keyed by API key
const _instances = new Map();

async function getHeyGenClient(tenantId) {
  let apiKey = process.env.HEYGEN_API_KEY;
  let defaultAvatarId = process.env.HEYGEN_AVATAR_ID || null;
  let defaultVoiceId  = process.env.HEYGEN_VOICE_ID  || null;

  if (tenantId) {
    const creds = await getCredentials(tenantId, 'heygen').catch(() => null);
    if (creds?.apiKey) {
      apiKey = creds.apiKey;
      defaultAvatarId = creds.avatarId || defaultAvatarId;
      defaultVoiceId  = creds.voiceId  || defaultVoiceId;
    }
  }

  if (!apiKey) return null;

  const cacheKey = `${apiKey}:${defaultAvatarId}:${defaultVoiceId}`;
  if (!_instances.has(cacheKey)) {
    _instances.set(cacheKey, new HeyGenClient(apiKey, defaultAvatarId, defaultVoiceId));
  }
  return _instances.get(cacheKey);
}

module.exports = { getHeyGenClient };
