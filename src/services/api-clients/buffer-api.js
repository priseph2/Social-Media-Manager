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

    const orgData = await this._gql(`
      query GetOrganizations {
        account { organizations { id name } }
      }
    `);
    const org = orgData?.account?.organizations?.[0];
    if (!org?.id) throw new Error('Could not resolve Buffer organization ID');
    logger.info('[Buffer] Organization found', { orgId: org.id, orgName: org.name });

    const chData = await this._gql(`
      query GetChannels($organizationId: String!) {
        channels(organizationId: $organizationId) { id service name }
      }
    `, { organizationId: org.id });

    const rawChannels = chData?.channels ?? [];
    logger.info('[Buffer] Raw channels from API', {
      count: rawChannels.length,
      channels: rawChannels.map((c) => ({ service: c.service, name: c.name, id: c.id })),
    });

    this._channelsByPlatform = {};
    for (const ch of rawChannels) {
      // Map Buffer's service name to our internal platform name
      const platform = SERVICE_MAP[ch.service] || ch.service;
      // First channel for a platform wins; don't overwrite
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

      logger.info('[Buffer] Sending CreatePost mutation', { platform, channelId, scheduledAt: input.scheduledAt, hasMedia: !!input.media });

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
        logger.error('[Buffer] CreatePost mutation failed', {
          platform, channelId, error: gqlErr.message,
          hint: 'Check field names against Buffer GraphQL schema — scheduledAt, text, media, channelId',
        });
        return { success: false, error: gqlErr.message };
      }

      const post = data?.createPost?.post;
      if (!post?.id) {
        logger.warn('[Buffer] CreatePost returned no post ID', { platform, data: JSON.stringify(data) });
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
