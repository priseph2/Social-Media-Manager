'use strict';

const BaseSkill = require('../base-skill');
const Content = require('../../models/content.model');
const { getHeyGenClient } = require('../../services/api-clients/heygen-api');
const { eventBus } = require('../../services/messaging/event-emitter');
const { EVENTS } = require('../../config/constants');
const { recordUsage } = require('../../services/billing/usage-meter');
const logger = require('../../utils/logger');

// How long to poll before giving up (10 min)
const MAX_POLL_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 15 * 1000;

// Estimated cost per minute of HeyGen video (credits → USD)
const COST_PER_MIN_USD = 0.10;

class VideoProducer extends BaseSkill {
  constructor() {
    super('video-producer');
  }

  async execute(job) {
    const { contentId, tenantId, platform, content } = job.data;

    if (!tenantId) throw new Error('video-producer: tenantId required');

    const client = await getHeyGenClient(tenantId);
    if (!client) {
      this.log.warn('[VideoProducer] No HeyGen client — skipping video generation', { tenantId, contentId });
      // Fall back to image generation by publishing the same event visual-designer would
      eventBus.publish(EVENTS.VIDEO_GENERATION_UNAVAILABLE, { ...job.data });
      return { skipped: true, reason: 'no_heygen_key' };
    }

    // Mark video as generating
    if (contentId) {
      await Content.findByIdAndUpdate(contentId, {
        videoStatus: 'generating',
        videoGeneratingAt: new Date(),
      }).catch(() => {});
    }

    // Extract the script — use the caption text, trimmed to ~60 seconds of speech (~900 words)
    const rawText = content?.selectedContent
      || content?.captions?.[content?.recommendedIndex]?.text
      || (typeof content === 'string' ? content : '');

    const script = rawText.substring(0, 900).trim();
    if (!script) throw new Error('video-producer: no script text in job data');

    // Orientation: vertical for TikTok/Instagram Reels
    const orientation = ['instagram', 'tiktok'].includes(platform) ? 'vertical' : 'square';

    this.log.info('[VideoProducer] Submitting to HeyGen', { tenantId, platform, orientation, scriptLen: script.length });

    const { videoId } = await client.generateVideo({ script, orientation });

    // Poll for completion
    const startedAt = Date.now();
    let videoUrl = null;

    while (Date.now() - startedAt < MAX_POLL_MS) {
      await sleep(POLL_INTERVAL_MS);
      const { status, videoUrl: url, error } = await client.getVideoStatus(videoId);

      this.log.info('[VideoProducer] Poll', { videoId, status, elapsed: Math.round((Date.now() - startedAt) / 1000) + 's' });

      if (status === 'completed' && url) {
        videoUrl = url;
        break;
      }
      if (status === 'failed') {
        throw new Error(`HeyGen video generation failed: ${error || 'unknown error'}`);
      }
    }

    if (!videoUrl) throw new Error('HeyGen: video did not complete within 10 minutes');

    // Estimate duration from script (~130 words/min speaking pace)
    const wordCount = script.split(/\s+/).length;
    const estimatedMinutes = Math.max(0.5, wordCount / 130);
    const costUsd = parseFloat((estimatedMinutes * COST_PER_MIN_USD).toFixed(4));

    // Persist to content document
    if (contentId) {
      await Content.findByIdAndUpdate(contentId, {
        videoUrl,
        videoStatus: 'generated',
        videoGeneratingAt: null,
        heygenVideoId: videoId,
      });
    }

    // Record usage
    recordUsage(tenantId, 'heygen-video', costUsd, 'video-producer').catch(() => {});

    this.log.info('[VideoProducer] Video ready', { videoId, videoUrl, costUsd });

    // Notify orchestrator so schedule-post fires with videoUrl
    eventBus.publish(EVENTS.VIDEO_GENERATED, { ...job.data, videoUrl });

    return { videoUrl, videoId, costUsd };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = VideoProducer;
