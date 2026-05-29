'use strict';

const BaseSkill = require('../base-skill');
const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { adaptForPlatform, getPlatformConfig, PLATFORM_CONFIGS } = require('./platform-adapters');
const { generateHashtags, getRecentHashtags } = require('./hashtag-manager');
const { analyzeComment, analyzeComments } = require('./sentiment-analyzer');
const { eventBus, EVENTS } = require('../../services/messaging/event-emitter');
const { enqueue } = require('../../orchestrator/message-queue');
const { supabaseQuery } = require('../../services/database/supabase-client');
const ayrshareApi = require('../../services/api-clients/ayrshare-api');
const metaApi = require('../../services/api-clients/meta-api');
const tiktokApi = require('../../services/api-clients/tiktok-api');
const { SKILLS, QUEUES, PRIORITY, MODELS } = require('../../config/constants');
const { notify } = require('../../services/notifications');

const ADAPTATION_TOOL = {
  name: 'submit_platform_adaptations',
  description: 'Submit content adapted for all requested platforms',
  input_schema: {
    type: 'object',
    properties: {
      adaptations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            platform: { type: 'string' },
            text: { type: 'string', description: 'Adapted caption text (no hashtags — added separately)' },
            keyChanges: { type: 'string', description: 'What was changed vs. the original' },
          },
          required: ['platform', 'text'],
        },
      },
    },
    required: ['adaptations'],
  },
};

const PERFORMANCE_TOOL = {
  name: 'submit_performance_insights',
  description: 'Submit analysis of post performance and actionable recommendations',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      topPerformingPatterns: { type: 'array', items: { type: 'string' } },
      underperformingPatterns: { type: 'array', items: { type: 'string' } },
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            expectedImpact: { type: 'string' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
        },
      },
      optimalPostingTimes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            platform: { type: 'string' },
            day: { type: 'string' },
            time: { type: 'string' },
            engagementMultiplier: { type: 'number' },
          },
        },
      },
    },
    required: ['summary', 'recommendations'],
  },
};

const ADAPTATION_SYSTEM = `You are a platform content specialist for Cascades Luxury — a premium fragrance brand in West Africa.

Adapt content to fit each platform's unique culture while preserving the luxury brand voice.

Platform personas:
- Instagram: aspirational, visual-first, sensory descriptions, lifestyle hooks
- Facebook: storytelling, community warmth, slightly more conversational
- Twitter: punchy one-liners, clever, conversational but still premium
- TikTok: energetic hook-first, trending references (but no slang that undermines luxury)
- Pinterest: descriptive, evergreen, lifestyle-focused, search-optimised

NEVER strip the luxury positioning. Even TikTok content should feel premium.
Do NOT include hashtags in the text — those are added separately.`;

/**
 * SKILL 2: Social Media Manager — Phase 2 (Fully Implemented)
 *
 * Job types:
 *   schedule-post          → adapt content + generate hashtags + schedule via Buffer + log to Supabase
 *   monitor-engagement     → pull Meta mentions, run sentiment analysis, escalate if negative
 *   analyze-comment        → sentiment analysis on a single comment
 *   adapt-cross-platform   → take one piece of content and create all platform versions
 *   optimize-performance   → analyse historical data and give actionable recommendations
 *   manage-hashtags        → refresh hashtag strategy for a platform
 */
class SocialMediaManager extends BaseSkill {
  constructor() {
    super(SKILLS.SOCIAL_MEDIA_MANAGER);
  }

  async execute(job) {
    switch (job.name) {
      case 'schedule-post':
        return this.schedulePost(job);
      case 'monitor-engagement':
        return this.monitorEngagement(job);
      case 'analyze-comment':
        return this.analyzeSingleComment(job);
      case 'adapt-cross-platform':
        return this.adaptCrossPlatform(job);
      case 'optimize-performance':
        return this.optimizePerformance(job);
      case 'manage-hashtags':
        return this.manageHashtags(job);
      default:
        throw new Error(`Social Media Manager: unknown job "${job.name}"`);
    }
  }

  // ── Schedule Post ────────────────────────────────────────────────────────────

  async schedulePost(job) {
    const { platform, content, scheduledAt, contentType = 'lifestyle', originalJobId, imageUrl, videoUrl, tenantId } = job.data;
    const text = content?.selectedContent || content?.captions?.[content.recommendedIndex]?.text || content;

    if (!text) throw new Error('schedulePost: no content text provided');

    this.log.info(`Scheduling post on ${platform}`, { jobId: job.id });

    // Generate optimised hashtags, rotating away from recently used ones
    const recentHashtags = await getRecentHashtags(platform, 14);
    const hashtags = await generateHashtags(text, platform, contentType, recentHashtags);

    // Format content for the platform
    const adapted = adaptForPlatform(text, hashtags, platform);
    if (adapted.truncated) this.log.warn(`Content truncated for ${platform} limit`, { jobId: job.id });

    // Determine optimal posting time
    const postTime = scheduledAt || (await this._getOptimalPostTime(platform));
    const scheduledTs = postTime ? Math.floor(new Date(postTime).getTime() / 1000) : null;

    // ── Native publishing (Meta/TikTok) with Ayrshare fallback ───────────────
    let nativeResult = null;
    let ayrshareResult = { success: false };

    if (platform === 'instagram' && metaApi.available && imageUrl) {
      nativeResult = await metaApi.publishInstagramPost({
        caption: adapted.text,
        imageUrl,
        scheduledPublishTime: scheduledTs,
      });
      this.log.info(`Instagram native publish: ${nativeResult.success ? 'ok' : nativeResult.error}`, { jobId: job.id });
    } else if (platform === 'facebook' && metaApi.available) {
      nativeResult = await metaApi.publishPagePost({
        message: adapted.text,
        scheduledPublishTime: scheduledTs,
      });
      this.log.info(`Facebook native publish: ${nativeResult.success ? 'ok' : nativeResult.error}`, { jobId: job.id });
    } else if (platform === 'tiktok' && tiktokApi.available) {
      if (imageUrl) {
        nativeResult = await tiktokApi.publishPhotoPost({ caption: adapted.text, imageUrls: [imageUrl] });
      } else if (videoUrl) {
        nativeResult = await tiktokApi.publishVideoPost({ caption: adapted.text, videoUrl });
      }
      if (nativeResult) this.log.info(`TikTok native publish: ${nativeResult.success ? 'ok' : nativeResult.reason || nativeResult.error}`, { jobId: job.id });
    }

    // Fall back to Ayrshare if native posting was skipped or failed
    if (!nativeResult?.success) {
      ayrshareResult = await ayrshareApi.schedulePost({ platform, text: adapted.text, mediaUrls: imageUrl ? [imageUrl] : [], scheduledAt: postTime });
    }

    // Log to Supabase content_schedule table
    await this._logScheduledPost({
      platform,
      contentType,
      scheduledAt: postTime,
      content: adapted.text,
      hashtags,
      originalJobId,
    });

    this.log.info(`Post handled for ${platform} at ${postTime}`, {
      jobId: job.id,
      nativeSuccess: nativeResult?.success ?? false,
      ayrshareSuccess: ayrshareResult.success,
    });

    if (tenantId) {
      const scheduled = nativeResult?.success || ayrshareResult.success;
      await notify(tenantId, {
        type: 'post_scheduled',
        title: scheduled ? `Post scheduled on ${platform}` : `Post scheduling issue on ${platform}`,
        body: scheduled
          ? `Your content has been scheduled for ${platform}${postTime ? ` at ${new Date(postTime).toUTCString()}` : ''}.`
          : `There was an issue scheduling your post on ${platform}. Please check your connected accounts.`,
        link: '/dashboard/content/calendar',
      });
    }

    return {
      success: true,
      platform,
      scheduledAt: postTime,
      contentLength: adapted.text.length,
      hashtagCount: hashtags.length,
      nativePublished: nativeResult?.success ?? false,
      ayrshareScheduled: ayrshareResult.success,
      jobId: job.id,
    };
  }

  // ── Monitor Engagement ──────────────────────────────────────────────────────

  async monitorEngagement(job) {
    const { postContext = '' } = job.data;
    this.log.info('Monitoring engagement', { jobId: job.id });

    // Pull mentions from Meta API
    const mentions = await metaApi.getInstagramMentions();
    if (!mentions.length) return { checked: true, mentions: 0, jobId: job.id };

    // Run sentiment analysis in parallel
    const analyses = await analyzeComments(mentions, 'instagram', postContext);

    const urgent = analyses.filter((a) => a.escalate || a.urgency === 'immediate');
    const negative = analyses.filter((a) => a.sentiment === 'negative' || a.sentiment === 'angry');
    const opportunities = analyses.filter((a) => a.intent === 'purchase_intent');

    // Escalate urgent/negative items
    if (urgent.length || negative.length) {
      for (const item of [...urgent, ...negative]) {
        eventBus.publish(EVENTS.NEGATIVE_SENTIMENT, {
          source: 'instagram',
          comment: item.text,
          sentiment: item.sentiment,
          sentimentScore: item.sentimentScore,
          escalationReason: item.escalationReason,
        });
      }
    }

    // Flag purchase intent for Customer Service to follow up
    if (opportunities.length) {
      for (const opp of opportunities) {
        await enqueue(QUEUES.CUSTOMER_SERVICE, 'handle-inquiry', {
          customerMessage: opp.text,
          channel: 'instagram_comment',
          intent: 'purchase_intent',
        }, { priority: PRIORITY.HIGH });
      }
    }

    return {
      checked: true,
      totalMentions: mentions.length,
      sentimentBreakdown: {
        positive: analyses.filter((a) => a.sentiment === 'positive').length,
        neutral: analyses.filter((a) => a.sentiment === 'neutral').length,
        negative: negative.length,
      },
      escalated: urgent.length,
      purchaseIntents: opportunities.length,
      jobId: job.id,
    };
  }

  // ── Analyze Single Comment ─────────────────────────────────────────────────

  async analyzeSingleComment(job) {
    const { text, platform, postContext } = job.data;
    const result = await analyzeComment(text, platform, postContext);

    if (result.escalate) {
      eventBus.publish(EVENTS.NEGATIVE_SENTIMENT, { source: platform, comment: text, ...result });
    }

    return { ...result, jobId: job.id };
  }

  // ── Cross-Platform Adaptation ──────────────────────────────────────────────

  async adaptCrossPlatform(job) {
    const { originalContent, originalPlatform, targetPlatforms = ['instagram', 'facebook', 'twitter', 'tiktok'] } = job.data;

    this.log.info('Adapting content cross-platform', { from: originalPlatform, to: targetPlatforms, jobId: job.id });

    const platformSpecs = targetPlatforms
      .map((p) => {
        const config = getPlatformConfig(p);
        return `${p}: max ${config.maxChars} chars, tone: ${config.tone}`;
      })
      .join('\n');

    const prompt = [
      `ORIGINAL PLATFORM: ${originalPlatform}`,
      `ORIGINAL CONTENT:\n"${originalContent}"`,
      `\nAdapt this content for these platforms:\n${platformSpecs}`,
      '\nPreserve the core message and luxury positioning. Adjust tone and length to suit each platform.',
      'Do NOT include hashtags — they are handled separately.',
    ].join('\n');

    const response = await createMessage({
      model: MODELS.PRIMARY,
      maxTokens: 2000,
      system: [cachedSystemBlock(ADAPTATION_SYSTEM)],
      messages: [{ role: 'user', content: prompt }],
      tools: [ADAPTATION_TOOL],
      label: 'Social Media: cross-platform adaptation',
    });

    const output = extractToolInput(response);
    if (!output) throw new Error('Cross-platform adaptation returned no output');

    // Add hashtags to each adaptation and format for platform
    const enriched = await Promise.all(
      output.adaptations.map(async (a) => {
        const recentHashtags = await getRecentHashtags(a.platform, 14);
        const hashtags = await generateHashtags(a.text, a.platform, 'lifestyle', recentHashtags);
        const formatted = adaptForPlatform(a.text, hashtags, a.platform);
        return { ...a, finalText: formatted.text, hashtags, truncated: formatted.truncated };
      })
    );

    return { adaptations: enriched, originalPlatform, jobId: job.id };
  }

  // ── Performance Optimization ───────────────────────────────────────────────

  async optimizePerformance(job) {
    const { platform, recentPosts = [], period = '30 days' } = job.data;
    this.log.info('Analysing post performance', { platform, jobId: job.id });

    // Fetch performance data from Supabase
    const historicalData = await supabaseQuery((db) =>
      db
        .from('content_schedule')
        .select('platform, content_type, scheduled_at, status')
        .eq('platform', platform)
        .eq('status', 'posted')
        .limit(50)
    ) || [];

    const postsData = recentPosts.length ? recentPosts : historicalData;
    if (!postsData.length) {
      return { status: 'insufficient_data', message: 'Need at least 10 posts to analyse performance', jobId: job.id };
    }

    const prompt = [
      `Analyse these ${platform} post performance metrics for Cascades Luxury and provide actionable recommendations.`,
      `Period: ${period}`,
      `Platform: ${platform}`,
      '',
      'POST DATA:',
      JSON.stringify(postsData, null, 2),
      '',
      'Identify patterns in what drives high engagement for a luxury fragrance brand in West Africa.',
      'Be specific — give concrete content angles and posting strategies that have worked.',
    ].join('\n');

    const response = await createMessage({
      model: MODELS.PRIMARY,
      maxTokens: 1500,
      system: [cachedSystemBlock(`You are a social media performance analyst for Cascades Luxury — a premium fragrance brand in West Africa.
Provide data-driven, actionable insights to improve social media performance.
Focus on what matters for luxury brand positioning and West African audience behaviour.`)],
      messages: [{ role: 'user', content: prompt }],
      tools: [PERFORMANCE_TOOL],
      label: `Social Media: performance analysis (${platform})`,
    });

    const output = extractToolInput(response);
    if (!output) throw new Error('Performance analysis returned no output');

    return { ...output, platform, period, postsAnalyzed: postsData.length, jobId: job.id };
  }

  // ── Manage Hashtags ─────────────────────────────────────────────────────────

  async manageHashtags(job) {
    const { platform, postContent, contentType = 'lifestyle' } = job.data;
    this.log.info('Refreshing hashtag strategy', { platform, jobId: job.id });

    const recentHashtags = await getRecentHashtags(platform, 21);
    const hashtags = await generateHashtags(postContent || 'General luxury fragrance content', platform, contentType, recentHashtags);

    return { platform, hashtags, count: hashtags.length, jobId: job.id };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  async _getOptimalPostTime(platform) {
    // Evidence-based defaults for WAT — updated by Analytics Monitor in Phase 5
    const schedule = {
      instagram: { day: 2, hour: 14 },  // Tuesday 2 PM
      facebook:  { day: 3, hour: 13 },  // Wednesday 1 PM
      twitter:   { day: 1, hour: 9  },  // Monday 9 AM
      tiktok:    { day: 2, hour: 18 },  // Tuesday 6 PM
      pinterest: { day: 0, hour: 20 },  // Sunday 8 PM
    };
    const config = schedule[platform] || { day: 1, hour: 12 };
    const now = new Date();
    const daysUntil = (config.day + 7 - now.getDay()) % 7 || 7;
    const postDate = new Date(now);
    postDate.setDate(postDate.getDate() + daysUntil);
    postDate.setHours(config.hour, 0, 0, 0);
    return postDate.toISOString();
  }

  async _logScheduledPost({ platform, contentType, scheduledAt, content, hashtags, originalJobId }) {
    await supabaseQuery((db) =>
      db.from('content_schedule').insert({
        platform,
        content_type: contentType,
        scheduled_at: scheduledAt,
        content: content.substring(0, 2000),
        status: 'scheduled',
        mongo_ref: originalJobId,
      })
    );
  }
}

module.exports = SocialMediaManager;
