'use strict';

const { z } = require('zod');

const SocialCaptionRequestSchema = z.object({
  type: z.literal('social_caption'),
  platform: z.enum(['instagram', 'facebook', 'tiktok', 'twitter', 'pinterest']),
  theme: z.string().min(3).max(300),
  product: z.string().max(200).optional(),
  audience: z.string().max(300).optional(),
  tone: z.string().max(200).optional(),
  performanceContext: z.string().max(500).optional(),
});

const EmailCampaignRequestSchema = z.object({
  type: z.literal('email_campaign'),
  campaignGoal: z.string().min(3).max(300),
  audienceSegment: z.string().min(1).max(200),
  product: z.string().max(200).optional(),
  offer: z.string().max(300).optional(),
  urgency: z.string().max(200).optional(),
});

const BlogPostRequestSchema = z.object({
  type: z.literal('blog_post'),
  topic: z.string().min(5).max(300),
  targetKeyword: z.string().min(2).max(100),
  audience: z.string().max(300).optional(),
  wordCount: z.number().min(300).max(1500).optional().default(600),
});

const ProductDescriptionRequestSchema = z.object({
  type: z.literal('product_description'),
  productName: z.string().min(2).max(150),
  brand: z.string().min(1).max(100),
  fragranceNotes: z.array(z.string().max(80)).max(10).optional(),
  priceNGN: z.number().min(0).max(100_000_000).optional(),
  size: z.string().max(50).optional(),
  targetAudience: z.string().max(300).optional(),
  uniqueSellingPoints: z.array(z.string().max(200)).max(8).optional(),
});

const ContentCalendarRequestSchema = z.object({
  type: z.literal('content_calendar'),
  month: z.string().max(20),
  year: z.number().min(2020).max(2100).optional(),
  keyEvents: z.array(z.string().max(150)).max(20).optional(),
  productLaunches: z.array(z.string().max(150)).max(10).optional(),
});

const DailyContentRequestSchema = z.object({
  type: z.literal('daily_content'),
  trigger: z.string().max(100).optional(),
  date: z.string().max(30).optional(),
});

const TikTokScriptRequestSchema = z.object({
  type: z.literal('tiktok_script'),
  platform: z.enum(['tiktok', 'reels', 'shorts']),
  theme: z.string().min(3).max(300),
  product: z.string().max(200).optional(),
  duration: z.enum(['15s', '30s', '45s', '60s', '90s', '3min']).optional().default('45s'),
  contentPillar: z.enum(['education', 'entertainment', 'inspiration', 'product_showcase', 'behind_the_scenes', 'trend_participation']).optional(),
  tone: z.string().max(200).optional(),
  targetAudience: z.string().max(300).optional(),
});

const ImageBriefRequestSchema = z.object({
  type: z.literal('image_brief'),
  platform: z.enum(['instagram', 'facebook', 'tiktok', 'linkedin', 'pinterest', 'website', 'email']),
  format: z.enum(['feed_square', 'feed_portrait', 'story', 'cover', 'ad_banner', 'email_header']).optional().default('feed_square'),
  concept: z.string().min(5).max(500),
  product: z.string().max(200).optional(),
  mood: z.string().max(200).optional(),
  copyOverlay: z.string().max(200).optional(),
  numberOfVariants: z.number().min(1).max(4).optional().default(1),
});

const ContentRequestSchema = z.discriminatedUnion('type', [
  SocialCaptionRequestSchema,
  EmailCampaignRequestSchema,
  BlogPostRequestSchema,
  ProductDescriptionRequestSchema,
  ContentCalendarRequestSchema,
  DailyContentRequestSchema,
  TikTokScriptRequestSchema,
  ImageBriefRequestSchema,
]);

function validateRequest(data) {
  const result = ContentRequestSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid content request: ${issues}`);
  }
  return result.data;
}

module.exports = { validateRequest, TikTokScriptRequestSchema, ImageBriefRequestSchema };
