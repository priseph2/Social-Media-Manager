'use strict';

const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    externalId: { type: String, index: true }, // Shopify customer ID, etc.
    channel: { type: String },                  // instagram, whatsapp, email, website
    name: { type: String },
    email: { type: String },
    phone: { type: String },
    segment: {
      type: String,
      enum: ['new', 'engaged', 'repeat', 'vip', 'inactive', 'at_risk'],
      default: 'new',
    },
    inquiries: [
      {
        channel: String,
        message: String,
        intent: String,        // product_info, order_status, complaint, general
        sentiment: String,     // positive, neutral, negative, angry
        sentimentScore: Number,
        response: String,
        resolvedAt: Date,
        escalated: Boolean,
      },
    ],
    purchaseHistory: [
      {
        orderId: String,
        products: [String],
        value: Number,
        currency: { type: String, default: 'NGN' },
        purchasedAt: Date,
      },
    ],
    totalSpend: { type: Number, default: 0 },
    ltv: { type: Number, default: 0 },
    lastContactedAt: { type: Date },
    npsScore: { type: Number },
    tags: [String],
  },
  { timestamps: true }
);

customerSchema.index({ email: 1 }, { sparse: true });
customerSchema.index({ segment: 1 });

module.exports = mongoose.model('Customer', customerSchema);
