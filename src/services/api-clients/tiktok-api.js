'use strict';

const logger = require('../../utils/logger');

/**
 * TikTok Content Posting API v2
 *
 * Supports direct photo and video post publishing.
 * Requires a User Access Token obtained via TikTok Login Kit (OAuth 2.0).
 *
 * Env vars:
 *   TIKTOK_ACCESS_TOKEN  — long-lived user access token
 *
 * TikTok does NOT support text-only posts; at least one photo or a video is required.
 * When only a caption is available (no media), publishing is skipped and Buffer fallback is used.
 */
class TikTokAPI {
  constructor() {
    this.accessToken = process.env.TIKTOK_ACCESS_TOKEN;
    this.baseUrl = 'https://open.tiktokapis.com/v2';
    this.available = Boolean(this.accessToken);
    if (!this.available) logger.warn('TikTok API not configured — native TikTok publishing disabled.');
  }

  async _request(path, body) {
    if (!this.available) throw new Error('TikTok not configured');
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const json = await res.json();
      if (json?.error?.code && json.error.code !== 'ok') {
        throw new Error(`TikTok API error: ${json.error.code} — ${json.error.message}`);
      }
      return json;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Publish a photo post to TikTok.
   *
   * @param {object} opts
   * @param {string}   opts.caption     - post title/caption (max 2 200 chars)
   * @param {string[]} opts.imageUrls   - array of publicly accessible photo URLs (1–35 images)
   * @returns {{ success: boolean, publishId?: string, reason?: string, error?: string }}
   */
  async publishPhotoPost({ caption, imageUrls }) {
    if (!this.available) return { success: false, reason: 'TikTok not configured' };
    if (!imageUrls?.length) return { success: false, reason: 'TikTok requires at least one image URL' };

    try {
      const data = await this._request('/post/publish/content/init/', {
        post_info: {
          title: caption?.substring(0, 2200) || '',
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          auto_add_music: true,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          photo_images: imageUrls.slice(0, 35),
          photo_cover_index: 0,
        },
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
      });

      const publishId = data?.data?.publish_id;
      logger.info('[TikTok] Photo post published', { publishId });
      return { success: true, publishId };
    } catch (err) {
      logger.error('[TikTok] publishPhotoPost failed', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Publish a video post to TikTok by pulling from a public URL.
   *
   * @param {object} opts
   * @param {string} opts.caption   - post title (max 2 200 chars)
   * @param {string} opts.videoUrl  - publicly accessible video URL
   */
  async publishVideoPost({ caption, videoUrl }) {
    if (!this.available) return { success: false, reason: 'TikTok not configured' };
    if (!videoUrl) return { success: false, reason: 'TikTok requires a video URL for video posts' };

    try {
      const data = await this._request('/post/publish/video/init/', {
        post_info: {
          title: caption?.substring(0, 2200) || '',
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: videoUrl,
        },
      });

      const publishId = data?.data?.publish_id;
      logger.info('[TikTok] Video post published', { publishId });
      return { success: true, publishId };
    } catch (err) {
      logger.error('[TikTok] publishVideoPost failed', { error: err.message });
      return { success: false, error: err.message };
    }
  }
}

module.exports = new TikTokAPI();
