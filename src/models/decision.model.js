'use strict';

const mongoose = require('mongoose');

const decisionSchema = new mongoose.Schema(
  {
    skill: { type: String, required: true },
    action: { type: String, required: true },
    input: { type: mongoose.Schema.Types.Mixed },
    output: { type: mongoose.Schema.Types.Mixed },
    escalated: { type: Boolean, default: false },
    escalationReason: { type: String },
    humanOverride: { type: Boolean, default: false },
    humanNote: { type: String },
    jobId: { type: String },
    durationMs: { type: Number },
  },
  { timestamps: true }
);

decisionSchema.index({ skill: 1, createdAt: -1 });
decisionSchema.index({ escalated: 1 });

module.exports = mongoose.model('Decision', decisionSchema);
