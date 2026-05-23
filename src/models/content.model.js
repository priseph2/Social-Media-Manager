'use strict';

const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    type: {
      type: String,
      enum: ['social_caption', 'email_campaign', 'blog_post', 'product_description', 'content_calendar', 'customer_response'],
      required: true,
    },
    platform: { type: String },
    requestedBy: { type: String, default: 'orchestrator' },
    input: { type: mongoose.Schema.Types.Mixed },
    variations: [
      {
        text: String,
        hashtags: [String],
        qualityScore: Number,
        approved: Boolean,
      },
    ],
    selectedVariation: { type: Number, default: 0 },
    brandReview: {
      status: { type: String, enum: ['pending', 'approved', 'rejected', 'needs_revision'] },
      qualityScore: { type: Number },
      feedback: { type: String },
      reviewedAt: { type: Date },
    },
    scheduledAt: { type: Date },
    postedAt: { type: Date },
    performance: {
      engagementRate: Number,
      reach: Number,
      impressions: Number,
      clicks: Number,
      saves: Number,
    },
    performancePrediction: {
      predictedEngagementRate: Number,
      predictedReach: Number,
      viralPotential: { type: String, enum: ['low', 'medium', 'high'] },
      confidence: { type: String, enum: ['low', 'medium', 'high'] },
      keyStrengths: [String],
      improvementSuggestions: [String],
      generatedAt: Date,
    },
    revenueAttributions: [
      {
        orderId: String,
        amount: Number,
        currency: String,
        confidence: { type: String, enum: ['high', 'medium', 'low'] },
        attributedAt: { type: Date, default: Date.now },
      },
    ],
    jobId: { type: String },
  },
  { timestamps: true }
);

contentSchema.index({ tenantId: 1, type: 1, createdAt: -1 });
contentSchema.index({ tenantId: 1, 'brandReview.status': 1 });
contentSchema.index({ tenantId: 1, platform: 1, postedAt: -1 });

module.exports = mongoose.model('Content', contentSchema);
