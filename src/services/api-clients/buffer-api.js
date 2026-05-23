'use strict';

const logger = require('../../utils/logger');

class BufferAPI {
  constructor() {
    this.accessToken = process.env.BUFFER_ACCESS_TOKEN;
    this.baseUrl = 'https://api.bufferapp.com/1';
    this.profileIds = {
      instagram: process.env.BUFFER_PROFILE_ID_INSTAGRAM,
      facebook: process.env.BUFFER_PROFILE_ID_FACEBOOK,
      twitter: process.env.BUFFER_PROFILE_ID_TWITTER,
      tiktok: process.env.BUFFER_PROFILE_ID_TIKTOK,
      pinterest: process.env.BUFFER_PROFILE_ID_PINTEREST,
    };
    this.available = Boolean(this.accessToken);
    if (!this.available) logger.warn('Buffer API not configured — social scheduling disabled.');
  }

  async schedulePost({ platform, text, mediaUrls = [], scheduledAt }) {
    if (!this.available) return { success: false, reason: 'Buffer not configured' };
    const profileId = this.profileIds[platform];
    if (!profileId) return { success: false, reason: `No Buffer profile ID for ${platform}` };

    // TODO: implement with node-fetch or axios when token is available
    logger.info(`[Buffer] Would schedule post on ${platform} at ${scheduledAt}`);
    return { success: true, scheduled: true, platform, scheduledAt };
  }

  async getAnalytics({ profileId, since, until }) {
    if (!this.available) return null;
    // TODO: GET /profiles/:id/updates/sent with date range
    return null;
  }
}

module.exports = new BufferAPI();
