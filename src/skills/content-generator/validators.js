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

const ContentRequestSchema = z.discriminatedUnion('type', [
  SocialCaptionRequestSchema,
  EmailCampaignRequestSchema,
  BlogPostRequestSchema,
  ProductDescriptionRequestSchema,
  ContentCalendarRequestSchema,
  DailyContentRequestSchema,
]);

function validateRequest(data) {
  const result = ContentRequestSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid content request: ${issues}`);
  }
  return result.data;
}

module.exports = { validateRequest };
