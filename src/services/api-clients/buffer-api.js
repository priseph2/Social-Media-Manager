'use strict';

const logger = require('../../utils/logger');

const GQL_ENDPOINT = 'https://api.buffer.com';

class BufferAPI {
  constructor() {
    this.apiKey = process.env.BUFFER_API_KEY;
    this.available = Boolean(this.apiKey);
    if (!this.available) logger.warn('Buffer API not configured — social scheduling disabled for non-native platforms.');

    // Channel IDs resolved once and cached for the process lifetime
    this._channelsByPlatform = null;
  }

  async _gql(query, variables = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(GQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (json.errors?.length) throw new Error(json.errors[0].message);
      return json.data;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Returns the Buffer organization ID for this API key.
   */
  async getOrganizationId() {
    const data = await this._gql(`
      query GetOrganizations {
        account {
          organizations {
            id
          }
        }
      }
    `);
    return data?.account?.organizations?.[0]?.id ?? null;
  }

  /**
   * Loads all connected channels for the org and returns a map of
   * { instagram: 'ch_xxx', twitter: 'ch_xxx', ... }
   */
  async _resolveChannels() {
    if (this._channelsByPlatform) return this._channelsByPlatform;

    const orgId = await this.getOrganizationId();
    if (!orgId) throw new Error('Could not resolve Buffer organization ID');

    const data = await this._gql(`
      query GetChannels($organizationId: String!) {
        channels(organizationId: $organizationId) {
          id
          service
          name
        }
      }
    `, { organizationId: orgId });

    const channels = data?.channels ?? [];
    this._channelsByPlatform = {};
    for (const ch of channels) {
      // Buffer service names: 'instagram', 'facebook', 'twitter', 'linkedin', 'tiktok', 'pinterest', 'youtube'
      this._channelsByPlatform[ch.service] = ch.id;
    }

    logger.info('[Buffer] Channels resolved', { platforms: Object.keys(this._channelsByPlatform) });
    return this._channelsByPlatform;
  }

  /**
   * Schedule or immediately publish a post via Buffer's new GraphQL API.
   *
   * @param {object} opts
   * @param {string}   opts.platform     - instagram | facebook | twitter | linkedin | tiktok | pinterest
   * @param {string}   opts.text         - post caption
   * @param {string[]} [opts.mediaUrls]  - public image URLs (optional)
   * @param {string|Date} [opts.scheduledAt] - ISO 8601; omit to add to queue
   * @returns {{ success: boolean, id?: string }}
   */
  async schedulePost({ platform, text, mediaUrls = [], scheduledAt }) {
    if (!this.available) return { success: false, reason: 'Buffer not configured' };

    try {
      const channels = await this._resolveChannels();
      const channelId = channels[platform];
      if (!channelId) {
        logger.warn(`[Buffer] No channel connected for ${platform}`);
        return { success: false, reason: `No Buffer channel connected for ${platform}` };
      }

      const input = {
        channelId,
        text,
      };

      if (scheduledAt) input.scheduledAt = new Date(scheduledAt).toISOString();
      if (mediaUrls.length) input.mediaUrls = mediaUrls.slice(0, 4);

      const data = await this._gql(`
        mutation CreatePost($input: CreatePostInput!) {
          createPost(input: $input) {
            post {
              id
              status
            }
          }
        }
      `, { input });

      const post = data?.createPost?.post;
      logger.info('[Buffer] Post scheduled', { platform, id: post?.id, status: post?.status });
      return { success: Boolean(post?.id), id: post?.id, status: post?.status, platform };
    } catch (err) {
      logger.error('[Buffer] schedulePost failed', { platform, error: err.message });
      return { success: false, error: err.message };
    }
  }
}

module.exports = new BufferAPI();
