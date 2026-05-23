'use strict';

module.exports = {
  // ── Job priorities (lower number = higher priority) ────────────────────────
  PRIORITY: {
    URGENT: 1,   // angry customer, API failure, brand crisis
    HIGH: 5,     // customer service, live post engagement
    NORMAL: 10,  // content generation, email campaigns
    LOW: 20,     // analytics aggregation, reporting
  },

  // ── Skill identifiers ──────────────────────────────────────────────────────
  SKILLS: {
    ORCHESTRATOR: 'orchestrator',
    CONTENT_GENERATOR: 'content-generator',
    SOCIAL_MEDIA_MANAGER: 'social-media-manager',
    EMAIL_STRATEGIST: 'email-strategist',
    CUSTOMER_SERVICE: 'customer-service-agent',
    ANALYTICS_MONITOR: 'analytics-monitor',
    BRAND_GUARDIAN: 'brand-guardian',
    ECOMMERCE_OPTIMIZER: 'ecommerce-optimizer',
  },

  // ── Queue names ────────────────────────────────────────────────────────────
  QUEUES: {
    CONTENT: 'content-generation',
    SOCIAL: 'social-media',
    EMAIL: 'email-campaigns',
    CUSTOMER_SERVICE: 'customer-service',
    ANALYTICS: 'analytics',
    BRAND_REVIEW: 'brand-review',
    ECOMMERCE: 'ecommerce',
    ORCHESTRATOR: 'orchestrator',
  },

  // ── Event names ────────────────────────────────────────────────────────────
  EVENTS: {
    NEW_CUSTOMER_INQUIRY: 'new_customer_inquiry',
    HIGH_ENGAGEMENT: 'high_engagement_detected',
    NEGATIVE_SENTIMENT: 'negative_sentiment',
    SALES_SPIKE: 'sales_spike',
    FOLLOWER_MILESTONE: 'new_social_follower_milestone',
    EMAIL_CAMPAIGN_SENT: 'email_campaign_sent',
    API_FAILURE: 'api_failure',
    SCHEDULED_TASK: 'scheduled_task_time',
    CONTENT_APPROVED: 'content_approved',
    CONTENT_REJECTED: 'content_rejected',
    ESCALATION_REQUIRED: 'escalation_required',
  },

  // ── Social platforms ───────────────────────────────────────────────────────
  PLATFORMS: {
    INSTAGRAM: 'instagram',
    FACEBOOK: 'facebook',
    TIKTOK: 'tiktok',
    TWITTER: 'twitter',
    PINTEREST: 'pinterest',
    WHATSAPP: 'whatsapp',
  },

  // ── Content types ──────────────────────────────────────────────────────────
  CONTENT_TYPES: {
    SOCIAL_CAPTION: 'social_caption',
    EMAIL_CAMPAIGN: 'email_campaign',
    BLOG_POST: 'blog_post',
    PRODUCT_DESCRIPTION: 'product_description',
    CONTENT_CALENDAR: 'content_calendar',
    CUSTOMER_RESPONSE: 'customer_response',
    TIKTOK_SCRIPT: 'tiktok_script',
    IMAGE_BRIEF: 'image_brief',
  },

  // ── Brand quality thresholds ───────────────────────────────────────────────
  BRAND: {
    MIN_QUALITY_SCORE: 75,      // below this, content is rejected
    AUTO_APPROVE_THRESHOLD: 90, // above this, no human review needed
    HIGH_RISK_THRESHOLD: 50,    // below this, always escalate to human
  },

  // ── Model config ───────────────────────────────────────────────────────────
  MODELS: {
    PRIMARY: 'claude-sonnet-4-6',        // content gen, analytics, orchestration
    FAST: 'claude-haiku-4-5-20251001',   // quick brand checks, customer service
  },
};
