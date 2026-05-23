'use strict';

const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['social_caption', 'email_campaign', 'blog_post', 'product_description', 'content_calendar', 'customer_response'],
      required: true,
    },
    platform: { type: String }, // instagram, facebook, etc.
    requestedBy: { type: String, default: 'orchestrator' },
    input: { type: mongoose.Schema.Types.Mixed },   // original generation request
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
    jobId: { type: String },
  },
  { timestamps: true }
);

contentSchema.index({ type: 1, createdAt: -1 });
contentSchema.index({ 'brandReview.status': 1 });
contentSchema.index({ platform: 1, postedAt: -1 });

module.exports = mongoose.model('Content', contentSchema);
