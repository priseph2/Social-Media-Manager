'use strict';

const logger = require('../../utils/logger');
const { getCredentials } = require('../credential-store');

const GQL_ENDPOINT = 'https://api.buffer.com';

class BufferClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
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

  async _resolveChannels() {
    if (this._channelsByPlatform) return this._channelsByPlatform;

    const orgData = await this._gql(`
      query GetOrganizations {
        account { organizations { id } }
      }
    `);
    const orgId = orgData?.account?.organizations?.[0]?.id;
    if (!orgId) throw new Error('Could not resolve Buffer organization ID');

    const chData = await this._gql(`
      query GetChannels($organizationId: String!) {
        channels(organizationId: $organizationId) { id service name }
      }
    `, { organizationId: orgId });

    this._channelsByPlatform = {};
    for (const ch of chData?.channels ?? []) {
      this._channelsByPlatform[ch.service] = ch.id;
    }
    logger.info('[Buffer] Channels resolved', { platforms: Object.keys(this._channelsByPlatform) });
    return this._channelsByPlatform;
  }

  async schedulePost({ platform, text, mediaUrls = [], scheduledAt }) {
    try {
      const channels = await this._resolveChannels();
      const channelId = channels[platform];
      if (!channelId) {
        logger.warn(`[Buffer] No channel connected for ${platform}`);
        return { success: false, reason: `No Buffer channel connected for ${platform}` };
      }

      // Buffer new API field names (GraphQL schema as of 2025)
      const input = { channelId, text };
      if (scheduledAt) input.scheduledAt = new Date(scheduledAt).toISOString();
      if (mediaUrls.length) input.media = mediaUrls.slice(0, 4).map((url) => ({ url }));

      let data;
      try {
        data = await this._gql(`
          mutation CreatePost($input: CreatePostInput!) {
            createPost(input: $input) {
              post { id status }
            }
          }
        `, { input });
      } catch (gqlErr) {
        // If field names are wrong the API returns a schema error — log clearly
        logger.error('[Buffer] CreatePost mutation failed — check field names against Buffer GraphQL schema', {
          platform, error: gqlErr.message,
        });
        return { success: false, error: gqlErr.message };
      }

      const post = data?.createPost?.post;
      if (!post?.id) {
        logger.warn('[Buffer] CreatePost returned no post ID', { platform, data: JSON.stringify(data) });
        return { success: false, error: 'Buffer returned no post ID' };
      }
      logger.info('[Buffer] Post scheduled', { platform, id: post.id, status: post.status });
      return { success: true, id: post.id, status: post.status, platform };
    } catch (err) {
      logger.error('[Buffer] schedulePost failed', { platform, error: err.message });
      return { success: false, error: err.message };
    }
  }
}

// Instance cache keyed by API key — preserves per-key channel resolution cache
const _instances = new Map();

/**
 * Returns a BufferClient for the given tenant, using their stored API key
 * if they have one, otherwise falling back to the global BUFFER_API_KEY env var.
 *
 * Returns null if neither source has a key.
 *
 * @param {string} tenantId
 * @returns {Promise<BufferClient|null>}
 */
async function getBufferClient(tenantId) {
  let apiKey = process.env.BUFFER_API_KEY;

  if (tenantId) {
    const creds = await getCredentials(tenantId, 'buffer').catch(() => null);
    if (creds?.apiKey) apiKey = creds.apiKey;
  }

  if (!apiKey) return null;

  if (!_instances.has(apiKey)) {
    _instances.set(apiKey, new BufferClient(apiKey));
  }
  return _instances.get(apiKey);
}

module.exports = { getBufferClient };
