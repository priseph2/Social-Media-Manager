'use strict';

const { z } = require('zod');

const SocialCaptionRequestSchema = z.object({
  type: z.literal('social_caption'),
  platform: z.enum(['instagram', 'facebook', 'tiktok', 'twitter', 'pinterest']),
  theme: z.string().min(3),
  product: z.string().optional(),
  audience: z.string().optional(),
  tone: z.string().optional(),
  performanceContext: z.string().optional(), // e.g. "last 10 posts averaged 3.2% engagement"
});

const EmailCampaignRequestSchema = z.object({
  type: z.literal('email_campaign'),
  campaignGoal: z.string(),
  audienceSegment: z.string(),
  product: z.string().optional(),
  offer: z.string().optional(),
  urgency: z.string().optional(),
});

const BlogPostRequestSchema = z.object({
  type: z.literal('blog_post'),
  topic: z.string(),
  targetKeyword: z.string(),
  audience: z.string().optional(),
  wordCount: z.number().min(300).max(1500).optional().default(600),
});

const ProductDescriptionRequestSchema = z.object({
  type: z.literal('product_description'),
  productName: z.string(),
  brand: z.string(),
  fragranceNotes: z.array(z.string()).optional(),
  priceNGN: z.number().optional(),
  size: z.string().optional(),
  targetAudience: z.string().optional(),
  uniqueSellingPoints: z.array(z.string()).optional(),
});

const ContentCalendarRequestSchema = z.object({
  type: z.literal('content_calendar'),
  month: z.string(),
  year: z.number().optional(),
  keyEvents: z.array(z.string()).optional(),
  productLaunches: z.array(z.string()).optional(),
});

const DailyContentRequestSchema = z.object({
  type: z.literal('daily_content'),
  trigger: z.string().optional(),
  date: z.string().optional(),
});

const TikTokScriptRequestSchema = z.object({
  type: z.literal('tiktok_script'),
  platform: z.enum(['tiktok', 'reels', 'shorts']),
  theme: z.string().min(3),
  product: z.string().optional(),
  duration: z.enum(['15s', '30s', '45s', '60s', '90s', '3min']).optional().default('45s'),
  contentPillar: z.enum(['education', 'entertainment', 'inspiration', 'product_showcase', 'behind_the_scenes', 'trend_participation']).optional(),
  tone: z.string().optional(),
  targetAudience: z.string().optional(),
});

const ImageBriefRequestSchema = z.object({
  type: z.literal('image_brief'),
  platform: z.enum(['instagram', 'facebook', 'tiktok', 'linkedin', 'pinterest', 'website', 'email']),
  format: z.enum(['feed_square', 'feed_portrait', 'story', 'cover', 'ad_banner', 'email_header']).optional().default('feed_square'),
  concept: z.string().min(5),
  product: z.string().optional(),
  mood: z.string().optional(),
  copyOverlay: z.string().optional(),
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
