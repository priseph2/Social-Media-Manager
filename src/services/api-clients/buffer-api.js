'use strict';

const logger = require('../../utils/logger');
const { getCredentials } = require('../credential-store');

const GQL_ENDPOINT = 'https://api.buffer.com';

// Buffer service names → our internal platform names
const SERVICE_MAP = {
  instagram:          'instagram',
  instagram_business: 'instagram',
  'instagram-business': 'instagram',
  facebook:           'facebook',
  facebook_page:      'facebook',
  'facebook-page':    'facebook',
  twitter:            'twitter',
  twitter_v2:         'twitter',
  'twitter-v2':       'twitter',
  linkedin:           'linkedin',
  linkedin_company:   'linkedin',
  pinterest:          'pinterest',
  tiktok:             'tiktok',
  googlebusiness:     'googlebusiness',
  youtube:            'youtube',
  mastodon:           'mastodon',
};

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

    // Single query: get org info + channels in one call
    const data = await this._gql(`
      query GetAccountChannels {
        account {
          organizations { id name }
          channels { id service name }
        }
      }
    `);

    const org = data?.account?.organizations?.[0];
    logger.info('[Buffer] Organization found', { orgId: org?.id, orgName: org?.name });

    const rawChannels = data?.account?.channels ?? [];
    logger.info('[Buffer] Raw channels from API', {
      count: rawChannels.length,
      channels: rawChannels.map((c) => ({ service: c.service, name: c.name, id: c.id })),
    });

    this._channelsByPlatform = {};
    for (const ch of rawChannels) {
      const platform = SERVICE_MAP[ch.service] || ch.service;
      if (!this._channelsByPlatform[platform]) {
        this._channelsByPlatform[platform] = ch.id;
      }
    }
    logger.info('[Buffer] Channel map built', { map: this._channelsByPlatform });
    return this._channelsByPlatform;
  }

  async schedulePost({ platform, text, mediaUrls = [], scheduledAt }) {
    try {
      const channels = await this._resolveChannels();
      const channelId = channels[platform];
      if (!channelId) {
        logger.warn('[Buffer] No channel connected for platform', {
          platform,
          availablePlatforms: Object.keys(channels),
        });
        return { success: false, reason: `No Buffer channel connected for ${platform}` };
      }

      const input = { channelId, text };
      if (scheduledAt) input.scheduledAt = new Date(scheduledAt).toISOString();
      if (mediaUrls.length) input.media = mediaUrls.slice(0, 4).map((url) => ({ url }));

      logger.info('[Buffer] Sending CreatePost mutation', { platform, channelId, scheduledAt: input.scheduledAt, hasMedia: !!input.media, inputKeys: Object.keys(input) });

      // Try the mutation; if it fails with a schema error, log the full raw response
      let rawRes;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        rawRes = await fetch(GQL_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({
            query: `mutation CreatePost($input: CreatePostInput!) {
              createPost(input: $input) {
                ... on PostActionSuccess { post { id status } }
                ... on PostActionError   { message }
              }
            }`,
            variables: { input },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
      } catch (fetchErr) {
        logger.error('[Buffer] CreatePost fetch failed', { platform, error: fetchErr.message });
        return { success: false, error: fetchErr.message };
      }

      const json = await rawRes.json();
      // Log the full response so we can see schema errors clearly
      logger.info('[Buffer] CreatePost raw response', { platform, status: rawRes.status, body: JSON.stringify(json).slice(0, 500) });

      if (json.errors?.length) {
        const errMsg = json.errors.map((e) => e.message).join('; ');
        logger.error('[Buffer] CreatePost mutation error', { platform, channelId, error: errMsg });
        return { success: false, error: errMsg };
      }

      const payload = json.data?.createPost;
      if (payload?.message) {
        logger.error('[Buffer] CreatePost action error', { platform, channelId, error: payload.message });
        return { success: false, error: payload.message };
      }
      const post = payload?.post;
      if (!post?.id) {
        logger.warn('[Buffer] CreatePost returned no post ID', { platform, payload: JSON.stringify(payload) });
        return { success: false, error: 'Buffer returned no post ID' };
      }
      logger.info('[Buffer] Post scheduled successfully', { platform, id: post.id, status: post.status });
      return { success: true, id: post.id, status: post.status, platform };
    } catch (err) {
      logger.error('[Buffer] schedulePost failed', { platform, error: err.message });
      return { success: false, error: err.message };
    }
  }

  // Returns connected channel info — used by the test endpoint
  async getChannelInfo() {
    const channels = await this._resolveChannels();
    return channels;
  }
}

// Instance cache keyed by API key — preserves per-key channel resolution cache
const _instances = new Map();

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
