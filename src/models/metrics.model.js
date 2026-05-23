'use strict';

const mongoose = require('mongoose');

// Stores daily rolled-up metrics from all channels
const metricsSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, index: true },
    channel: {
      type: String,
      enum: ['instagram', 'facebook', 'tiktok', 'twitter', 'pinterest', 'email', 'website', 'customer_service', 'ecommerce'],
      required: true,
    },
    data: { type: mongoose.Schema.Types.Mixed }, // flexible: each channel has different fields
    // Normalised cross-channel fields for quick querying
    reach: Number,
    engagementRate: Number,
    conversions: Number,
    revenue: Number,
    currency: { type: String, default: 'NGN' },
  },
  { timestamps: true }
);

metricsSchema.index({ date: -1, channel: 1 }, { unique: true });

module.exports = mongoose.model('Metrics', metricsSchema);
