'use strict';

const BaseSkill = require('../base-skill');
const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { validateRequest } = require('./validators');
const {
  BASE_SYSTEM,
  guidelinesContext,
  SOCIAL_CAPTIONS_TOOL,
  EMAIL_TOOL,
  BLOG_POST_TOOL,
  PRODUCT_DESCRIPTION_TOOL,
  CONTENT_CALENDAR_TOOL,
  TIKTOK_SCRIPT_TOOL,
  IMAGE_BRIEF_TOOL,
  REPURPOSE_TOOL,
} = require('./prompts');
const { enqueue } = require('../../orchestrator/message-queue');
const { SKILLS, QUEUES, PRIORITY, MODELS } = require('../../config/constants');
const { isMongoAvailable } = require('../../services/database/mongodb-client');
const { getBrandConfig } = require('../../services/brand-config');
const Content = require('../../models/content.model');

class ContentGenerator extends BaseSkill {
  constructor() {
    super(SKILLS.CONTENT_GENERATOR);
  }

  async execute(job) {
    const validated = validateRequest(job.data);
    const tenantId = job.data.tenantId || null;
    const brandConfig = await getBrandConfig(tenantId);

    let result;
    switch (validated.type) {
      case 'social_caption':
        result = await this.generateSocialCaptions(validated, job.id, brandConfig);
        break;
      case 'email_campaign':
        result = await this.generateEmailCampaign(validated, job.id, brandConfig);
        break;
      case 'blog_post':
        result = await this.generateBlogPost(validated, job.id, brandConfig);
        break;
      case 'product_description':
        result = await this.generateProductDescription(validated, job.id, brandConfig);
        break;
      case 'content_calendar':
        result = await this.generateContentCalendar(validated, job.id, brandConfig);
        break;
      case 'daily_content':
        result = await this.generateDailyContent(validated, job.id, brandConfig);
        break;
      case 'tiktok_script':
        result = await this.generateTikTokScript(validated, job.id, brandConfig);
        break;
      case 'image_brief':
        result = await this.generateImageBrief(validated, job.id, brandConfig);
        break;
      case 'repurposed_content':
        result = await this.generateRepurposed(validated, job.id, brandConfig);
        break;
      default:
        throw new Error(`Unknown content type: ${validated.type}`);
    }

    const contentId = await this._persist(result, job.id, tenantId);
    await this._sendForBrandReview(result, job.id, tenantId, contentId);
    return { ...result, contentId };
  }

  _guidelinesBlock(brandConfig) {
    return cachedSystemBlock(guidelinesContext(brandConfig));
  }

  async generateSocialCaptions(data, jobId, brandConfig) {
    const brandName = brandConfig?.identity?.name || 'the brand';
    this.log.info(`Generating social captions for ${data.platform}`, { jobId });

    const prompt = [
      `Generate 5 ${data.platform} social media captions for ${brandName}.`,
      `Theme: ${data.theme}`,
      data.product ? `Product/focus: ${data.product}` : '',
      data.audience ? `Target audience note: ${data.audience}` : '',
      data.tone ? `Desired tone: ${data.tone}` : '',
      data.performanceContext ? `Performance context: ${data.performanceContext}` : '',
      '',
      'Requirements:',
      '• 5 distinct captions with different creative angles',
      '• Each must feel crafted, not templated',
      '• Include 3-8 relevant hashtags per caption',
      '• Captions should create desire and invite engagement',
      `• Respect ${data.platform} character limits`,
    ].filter(Boolean).join('\n');

    const response = await createMessage({
      model: MODELS.PRIMARY,
      maxTokens: 2500,
      system: [cachedSystemBlock(BASE_SYSTEM), this._guidelinesBlock(brandConfig)],
      messages: [{ role: 'user', content: prompt }],
      tools: [SOCIAL_CAPTIONS_TOOL],
      label: `Content Generator: social captions (${data.platform})`,
    });

    const output = extractToolInput(response);
    if (!output) throw new Error('Content Generator did not return structured captions');

    return {
      type: 'social_caption',
      platform: data.platform,
      input: data,
      captions: output.captions,
      recommendedIndex: output.recommendedIndex,
      optimalPostingContext: output.optimalPostingContext,
      selectedContent: output.captions[output.recommendedIndex]?.text,
      jobId,
    };
  }

  async generateEmailCampaign(data, jobId, brandConfig) {
    this.log.info('Generating email campaign', { jobId, goal: data.campaignGoal });

    const prompt = [
      `Create a complete email campaign for ${brandConfig?.identity?.name || 'the brand'}.`,
      `Campaign goal: ${data.campaignGoal}`,
      `Target audience segment: ${data.audienceSegment}`,
      data.product ? `Product/offer: ${data.product}` : '',
      data.offer ? `Offer details: ${data.offer}` : '',
      data.urgency ? `Urgency/timing: ${data.urgency}` : '',
      '',
      'Deliver:',
      '• 2-3 subject line A/B test variants with different approaches',
      '• Complete email body (opening hook, main content, CTA)',
      '• Preview text for each subject line',
      '• The email should feel personal, not mass-broadcast',
    ].filter(Boolean).join('\n');

    const response = await createMessage({
      model: MODELS.PRIMARY,
      maxTokens: 3000,
      system: [cachedSystemBlock(BASE_SYSTEM), this._guidelinesBlock(brandConfig)],
      messages: [{ role: 'user', content: prompt }],
      tools: [EMAIL_TOOL],
      label: 'Content Generator: email campaign',
    });

    const output = extractToolInput(response);
    if (!output) throw new Error('Content Generator did not return structured email');

    const bodyText = [
      output.emailBody.openingHook,
      output.emailBody.mainContent,
      output.emailBody.bulletPoints?.join('\n'),
      output.emailBody.callToAction,
    ].filter(Boolean).join('\n\n');

    return {
      type: 'email_campaign',
      input: data,
      subjectLines: output.subjectLines,
      emailBody: output.emailBody,
      selectedContent: bodyText,
      estimatedOpenRate: output.estimatedOpenRate,
      targetSegment: output.targetSegment || data.audienceSegment,
      jobId,
    };
  }

  async generateBlogPost(data, jobId, brandConfig) {
    this.log.info('Generating blog post', { jobId, topic: data.topic });

    const prompt = [
      `Write a ${data.wordCount || 600}-word SEO-optimised blog post for ${brandConfig?.identity?.name || 'the brand'}'s website.`,
      `Topic: ${data.topic}`,
      `Target keyword: "${data.targetKeyword}"`,
      data.audience ? `Reader: ${data.audience}` : '',
      '',
      'Requirements:',
      '• Use the keyword naturally 3-5 times',
      '• Include an engaging hook that stops the scroll',
      '• 3-4 sections with clear subheadings',
      '• Include actionable insights or expert tips',
      `• End with a relevant CTA tied to ${brandConfig?.identity?.name || 'the brand'}`,
      '• Format in clean HTML (h2, p, ul)',
    ].filter(Boolean).join('\n');

    const response = await createMessage({
      model: MODELS.PRIMARY,
      maxTokens: 3500,
      system: [cachedSystemBlock(BASE_SYSTEM), this._guidelinesBlock(brandConfig)],
      messages: [{ role: 'user', content: prompt }],
      tools: [BLOG_POST_TOOL],
      label: 'Content Generator: blog post',
    });

    const output = extractToolInput(response);
    if (!output) throw new Error('Content Generator did not return structured blog post');

    return {
      type: 'blog_post',
      input: data,
      title: output.title,
      metaDescription: output.metaDescription,
      slug: output.slug,
      content: output.content,
      selectedContent: output.content,
      targetKeyword: output.targetKeyword,
      internalLinkSuggestions: output.internalLinkSuggestions,
      socialSnippets: output.socialSnippets,
      jobId,
    };
  }

  async generateProductDescription(data, jobId, brandConfig) {
    this.log.info('Generating product description', { jobId, product: data.productName });

    const currencyNote = brandConfig?.compliance?.pricing || '';
    const prompt = [
      `Write a luxury product description for ${brandConfig?.identity?.name || 'the brand'}'s website.`,
      `Product: ${data.productName}`,
      `Brand: ${data.brand}`,
      data.fragranceNotes?.length ? `Fragrance notes: ${data.fragranceNotes.join(', ')}` : '',
      data.priceNGN ? `Price: ₦${data.priceNGN.toLocaleString()}` : '',
      data.size ? `Size: ${data.size}` : '',
      data.targetAudience ? `Ideal for: ${data.targetAudience}` : '',
      data.uniqueSellingPoints?.length ? `USPs: ${data.uniqueSellingPoints.join(', ')}` : '',
      currencyNote ? `Pricing format: ${currencyNote}` : '',
      '',
      'Requirements:',
      '• Create desire and emotional connection first, then specs',
      '• Justify the price with perceived value language',
      '• Bullet points should be benefit-focused, not feature-focused',
      '• 150-word full description max',
    ].filter(Boolean).join('\n');

    const response = await createMessage({
      model: MODELS.PRIMARY,
      maxTokens: 1500,
      system: [cachedSystemBlock(BASE_SYSTEM), this._guidelinesBlock(brandConfig)],
      messages: [{ role: 'user', content: prompt }],
      tools: [PRODUCT_DESCRIPTION_TOOL],
      label: `Content Generator: product description (${data.productName})`,
    });

    const output = extractToolInput(response);
    if (!output) throw new Error('Content Generator did not return structured product description');

    return {
      type: 'product_description',
      input: data,
      headline: output.headline,
      shortDescription: output.shortDescription,
      fullDescription: output.fullDescription,
      bulletPoints: output.bulletPoints,
      seoTags: output.seoTags,
      luxuryAngle: output.luxuryAngle,
      selectedContent: output.fullDescription,
      jobId,
    };
  }

  async generateContentCalendar(data, jobId, brandConfig) {
    this.log.info('Generating content calendar', { jobId, month: data.month });

    const mix = brandConfig?.contentMix || {};
    const prompt = [
      `Create a 30-day social media content calendar for ${brandConfig?.identity?.name || 'the brand'}.`,
      `Month: ${data.month}${data.year ? ` ${data.year}` : ''}`,
      data.keyEvents?.length ? `Key dates and events: ${data.keyEvents.join(', ')}` : '',
      data.productLaunches?.length ? `Upcoming product launches: ${data.productLaunches.join(', ')}` : '',
      '',
      'Content mix targets:',
      mix.educational ? `• Educational: ${Math.round(mix.educational * 100)}%` : '• Educational: 25%',
      mix.productShowcase ? `• Product: ${Math.round(mix.productShowcase * 100)}%` : '• Product: 25%',
      mix.lifestyle ? `• Lifestyle: ${Math.round(mix.lifestyle * 100)}%` : '• Lifestyle: 20%',
      mix.community ? `• Community: ${Math.round(mix.community * 100)}%` : '• Community: 15%',
      mix.promotional ? `• Promotional: ${Math.round(mix.promotional * 100)}%` : '• Promotional: 15%',
    ].filter(Boolean).join('\n');

    const response = await createMessage({
      model: MODELS.PRIMARY,
      maxTokens: 4000,
      system: [cachedSystemBlock(BASE_SYSTEM), this._guidelinesBlock(brandConfig)],
      messages: [{ role: 'user', content: prompt }],
      tools: [CONTENT_CALENDAR_TOOL],
      label: `Content Generator: content calendar (${data.month})`,
    });

    const output = extractToolInput(response);
    if (!output) throw new Error('Content Generator did not return content calendar');

    return {
      type: 'content_calendar',
      input: data,
      month: output.month,
      theme: output.theme,
      weeklyBreakdown: output.weeklyBreakdown,
      keyDates: output.keyDates,
      emailCampaigns: output.emailCampaigns,
      selectedContent: JSON.stringify(output.weeklyBreakdown),
      jobId,
    };
  }

  async generateDailyContent(data, jobId, brandConfig) {
    this.log.info('Generating daily content batch', { jobId });
    const [instagramResult, facebookResult] = await Promise.all([
      this.generateSocialCaptions({ type: 'social_caption', platform: 'instagram', theme: 'Daily brand moment' }, `${jobId}-ig`, brandConfig),
      this.generateSocialCaptions({ type: 'social_caption', platform: 'facebook', theme: 'Daily brand moment' }, `${jobId}-fb`, brandConfig),
    ]);

    return {
      type: 'daily_content',
      input: data,
      instagram: instagramResult,
      facebook: facebookResult,
      selectedContent: instagramResult.selectedContent,
      jobId,
    };
  }

  async generateTikTokScript(data, jobId, brandConfig) {
    const brandName = brandConfig?.identity?.name || 'the brand';
    const platform = data.platform === 'reels' ? 'Instagram Reels' : data.platform === 'shorts' ? 'YouTube Shorts' : 'TikTok';
    this.log.info(`Generating ${platform} script`, { jobId });

    const prompt = [
      `Write a ${data.duration || '45s'} ${platform} video script for ${brandName}.`,
      `Theme: ${data.theme}`,
      data.product ? `Product/focus: ${data.product}` : '',
      data.contentPillar ? `Content pillar: ${data.contentPillar}` : '',
      data.tone ? `Desired tone: ${data.tone}` : '',
      data.targetAudience ? `Target audience: ${data.targetAudience}` : '',
      '',
      'The script MUST:',
      '• Open with a scroll-stopping hook in the first 3 seconds',
      '• Have tight, punchy scenes — each scene maximum 8-10 seconds',
      `• Fit the ${platform} format and algorithm`,
      '• Feel authentic, not like an ad — even if promoting a product',
      '• End with a clear, specific CTA',
      '• Include practical production notes a non-professional creator can follow',
    ].filter(Boolean).join('\n');

    const response = await createMessage({
      model: MODELS.PRIMARY,
      maxTokens: 3000,
      system: [cachedSystemBlock(BASE_SYSTEM), this._guidelinesBlock(brandConfig)],
      messages: [{ role: 'user', content: prompt }],
      tools: [TIKTOK_SCRIPT_TOOL],
      label: `Content Generator: ${platform} script`,
    });

    const output = extractToolInput(response);
    if (!output) throw new Error('Content Generator did not return a TikTok script');

    return {
      type: 'tiktok_script',
      platform: data.platform,
      input: data,
      hook: output.hook,
      scenes: output.scenes,
      totalDuration: output.totalDuration,
      captions: output.captions,
      hashtags: output.hashtags,
      trendingAudioSuggestion: output.trendingAudioSuggestion,
      cta: output.cta,
      productionNotes: output.productionNotes,
      contentPillar: output.contentPillar,
      selectedContent: output.captions?.[0] || '',
      jobId,
    };
  }

  async generateImageBrief(data, jobId, brandConfig) {
    const brandName = brandConfig?.identity?.name || 'the brand';
    this.log.info(`Generating image brief for ${data.platform}`, { jobId });

    const FORMAT_DIMENSIONS = {
      feed_square: { dimensions: '1080x1080', aspectRatio: '1:1' },
      feed_portrait: { dimensions: '1080x1350', aspectRatio: '4:5' },
      story: { dimensions: '1080x1920', aspectRatio: '9:16' },
      cover: { dimensions: '1500x500', aspectRatio: '3:1' },
      ad_banner: { dimensions: '1200x628', aspectRatio: '1.91:1' },
      email_header: { dimensions: '600x200', aspectRatio: '3:1' },
    };
    const dims = FORMAT_DIMENSIONS[data.format || 'feed_square'];

    const brandColors = brandConfig?.identity?.colors?.length
      ? `Brand colours: ${brandConfig.identity.colors.join(', ')}`
      : '';

    const prompt = [
      `Create a detailed image brief for ${brandName}.`,
      `Platform: ${data.platform} | Format: ${data.format || 'feed_square'} (${dims.dimensions})`,
      `Concept: ${data.concept}`,
      data.product ? `Product featured: ${data.product}` : '',
      data.mood ? `Desired mood: ${data.mood}` : '',
      data.copyOverlay ? `Text to appear on image: "${data.copyOverlay}"` : '',
      data.numberOfVariants && data.numberOfVariants > 1 ? `Produce ${data.numberOfVariants} variant briefs` : '',
      brandColors,
      '',
      'The brief must be specific enough that a designer can start in Canva immediately.',
      'Include exact hex codes where possible, specific element placements, and a practical Canva template suggestion.',
    ].filter(Boolean).join('\n');

    const response = await createMessage({
      model: MODELS.PRIMARY,
      maxTokens: 2500,
      system: [cachedSystemBlock(BASE_SYSTEM), this._guidelinesBlock(brandConfig)],
      messages: [{ role: 'user', content: prompt }],
      tools: [IMAGE_BRIEF_TOOL],
      label: `Content Generator: image brief (${data.platform})`,
    });

    const output = extractToolInput(response);
    if (!output) throw new Error('Content Generator did not return an image brief');

    return {
      type: 'image_brief',
      platform: data.platform,
      input: data,
      format: output.format,
      concept: output.concept,
      moodKeywords: output.moodKeywords,
      colorPalette: output.colorPalette,
      typography: output.typography,
      visualElements: output.visualElements || [],
      photographyOrIllustration: output.photographyOrIllustration,
      compositionNotes: output.compositionNotes,
      brandElements: output.brandElements,
      referenceStyle: output.referenceStyle,
      canvaTemplateCategory: output.canvaTemplateCategory,
      priority: output.priority,
      designerNotes: output.designerNotes,
      selectedContent: output.concept,
      jobId,
    };
  }

  async generateRepurposed(data, jobId, brandConfig) {
    const brandName = brandConfig?.identity?.name || 'the brand';
    const platforms = Array.isArray(data.platforms) && data.platforms.length
      ? data.platforms
      : ['instagram', 'facebook', 'twitter', 'linkedin'];

    this.log.info('Generating repurposed content', { jobId, source: data.sourceUrl });

    const prompt = [
      `You are repurposing third-party content into original social media posts for ${brandName}.`,
      '',
      `Source title: ${data.sourceTitle || data.sourceUrl}`,
      '',
      '--- SOURCE CONTENT ---',
      data.extractedText,
      '--- END SOURCE CONTENT ---',
      '',
      `Create one platform-optimised post for each of these platforms: ${platforms.join(', ')}.`,
      '',
      'Requirements:',
      '• Adapt the tone and format for each platform (Instagram: visual/lifestyle, LinkedIn: professional/insightful, Twitter/X: punchy/opinionated, Facebook: conversational, Pinterest: aspirational)',
      '• Do NOT just summarise — REFRAME the ideas in a way that is genuinely useful and relevant to the brand audience',
      '• Each post must stand on its own without needing to read the source',
      '• Maintain brand voice throughout',
      '• Include appropriate hashtags per platform',
      '• Extract 3-5 genuine key insights from the source that add value',
    ].filter(Boolean).join('\n');

    const response = await createMessage({
      model: MODELS.PRIMARY,
      maxTokens: 3000,
      system: [cachedSystemBlock(BASE_SYSTEM), this._guidelinesBlock(brandConfig)],
      messages: [{ role: 'user', content: prompt }],
      tools: [REPURPOSE_TOOL],
      label: 'Content Generator: repurpose content',
    });

    const output = extractToolInput(response);
    if (!output) throw new Error('Content Generator did not return repurposed content');

    return {
      type: 'repurposed_content',
      input: data,
      summary: output.summary,
      posts: output.posts,
      keyInsights: output.keyInsights,
      selectedContent: output.posts[0]?.caption || '',
      jobId,
    };
  }

  async _persist(result, jobId, tenantId) {
    if (!isMongoAvailable()) return null;
    try {
      let variations;
      if (result.type === 'repurposed_content' && Array.isArray(result.posts)) {
        variations = result.posts.map((p) => ({ text: p.caption, hashtags: p.hashtags || [] }));
      } else {
        variations = result.captions?.map((c) => ({ text: c.text, hashtags: c.hashtags })) || [{ text: result.selectedContent }];
      }

      const doc = await Content.create({
        tenantId,
        type: result.type,
        platform: result.platform,
        input: result.input,
        variations,
        selectedVariation: result.recommendedIndex || 0,
        brandReview: { status: 'pending' },
        ...(result.type === 'repurposed_content' && {
          repurposedPosts: result.posts,
          keyInsights: result.keyInsights || [],
        }),
        jobId,
      });
      return String(doc._id);
    } catch (err) {
      this.log.warn('Failed to persist content to MongoDB', { error: err });
      return null;
    }
  }

  async _sendForBrandReview(result, jobId, tenantId, contentId) {
    if (!result.selectedContent) return;
    await enqueue(QUEUES.BRAND_REVIEW, 'review-content', {
      tenantId,
      content: result.selectedContent,
      type: result.type,
      platform: result.platform,
      context: `Generated by Content Generator. Job: ${jobId}`,
      originalJobId: jobId,
      ...(contentId ? { contentId } : {}),
    }, { priority: PRIORITY.HIGH });
    this.log.info('Content sent to Brand Guardian for review', { jobId });
  }
}

module.exports = ContentGenerator;
