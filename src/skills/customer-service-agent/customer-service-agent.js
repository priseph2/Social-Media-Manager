'use strict';

const BaseSkill = require('../base-skill');
const { createMessage, cachedSystemBlock, extractToolInput } = require('../../services/anthropic-client');
const { SKILLS, MODELS, PRIORITY } = require('../../config/constants');
const { eventBus, EVENTS } = require('../../services/messaging/event-emitter');
const { getBrandConfig } = require('../../services/brand-config');
const whatsappApi = require('../../services/api-clients/whatsapp-api');
const tidioApi = require('../../services/api-clients/tidio-api');
const logger = require('../../utils/logger');

// ── System prompt factory ─────────────────────────────────────────────────────

function buildCsSystem(brandConfig) {
  const brandName = brandConfig?.identity?.name || 'the brand';
  const voice = brandConfig?.voice || {};
  const tone = voice.tone || 'warm, professional, and helpful';
  const doList = voice.doList?.map((d) => `  • ${d}`).join('\n') || '';
  const dontList = voice.dontList?.map((d) => `  • ${d}`).join('\n') || '';

  return `You are the Customer Service Agent for ${brandName} — the warmest, most knowledgeable voice the brand has.

You handle customer inquiries across Instagram DMs, WhatsApp, email, and website chat.

Your personality: You are like a personal shopping advisor for ${brandName}. You are ${tone}.
You know every product intimately. You resolve problems gracefully without making the customer feel like a burden.

Tone: ${tone}. Never robotic. Never pushy. Never dismissive.
Goal: Resolve the inquiry in one response if possible. Create loyalty, not just satisfaction.
${doList ? `\nDO:\n${doList}` : ''}
${dontList ? `\nDO NOT:\n${dontList}` : ''}

Escalation rules:
- ALWAYS escalate: angry customers, refund/return requests, legal/compliance questions, stock complaints
- NEVER promise what you cannot guarantee (delivery dates, specific stock arrival)
- ALWAYS maintain brand tone even when a customer is difficult`;
}

// ── Tool schema ───────────────────────────────────────────────────────────────

const RESPONSE_TOOL = {
  name: 'submit_customer_response',
  description: 'Submit the customer service response',
  input_schema: {
    type: 'object',
    properties: {
      response: { type: 'string', description: 'The response to send to the customer' },
      intent: {
        type: 'string',
        enum: ['product_info', 'order_status', 'complaint', 'recommendation', 'return_refund', 'general', 'compliment'],
      },
      sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative', 'angry'] },
      sentimentScore: { type: 'number', description: '0-100 where 0=angry, 100=delighted' },
      resolved: { type: 'boolean' },
      escalate: { type: 'boolean' },
      escalationReason: { type: 'string' },
      suggestedProducts: { type: 'array', items: { type: 'string' } },
      followUpAction: { type: 'string' },
    },
    required: ['response', 'intent', 'sentiment', 'sentimentScore', 'resolved', 'escalate'],
  },
};

// ── Skill ─────────────────────────────────────────────────────────────────────

class CustomerServiceAgent extends BaseSkill {
  constructor() {
    super(SKILLS.CUSTOMER_SERVICE);
  }

  async execute(job) {
    switch (job.name) {
      case 'handle-inquiry':
        return this.handleInquiry(job);
      case 'update-faq':
        return this.updateFAQ(job);
      default:
        throw new Error(`Customer Service Agent: unknown job "${job.name}"`);
    }
  }

  async handleInquiry(job) {
    const {
      customerMessage, channel, customerName, customerHistory, sentiment,
      tidioConversationId, customerId, tenantId,
    } = job.data;

    this.log.info(`Handling inquiry via ${channel}`, { jobId: job.id });

    const brandConfig = await getBrandConfig(tenantId || null);
    const systemPrompt = buildCsSystem(brandConfig);
    const brandContext = JSON.stringify({ identity: brandConfig?.identity, voice: brandConfig?.voice });

    // Pre-detect anger to bump priority
    if (sentiment === 'angry' || /refund|scam|fake|terrible|disgusting|worst/i.test(customerMessage)) {
      this.log.warn('Angry customer detected — escalating immediately', { jobId: job.id });
      eventBus.publish(EVENTS.NEGATIVE_SENTIMENT, { channel, customerMessage: customerMessage.substring(0, 200) });
    }

    const context = [
      customerName ? `Customer name: ${customerName}` : 'Customer: (name unknown)',
      `Channel: ${channel}`,
      customerHistory ? `Previous interactions: ${customerHistory}` : 'First contact',
    ].join('\n');

    const response = await createMessage({
      model: MODELS.FAST,
      maxTokens: 800,
      system: [
        cachedSystemBlock(systemPrompt),
        cachedSystemBlock(`BRAND CONTEXT:\n${brandContext}`),
      ],
      messages: [{ role: 'user', content: `${context}\n\nCUSTOMER MESSAGE:\n"${customerMessage.slice(0, 2000)}"` }],
      tools: [RESPONSE_TOOL],
      label: `Customer Service (${channel})`,
    });

    const output = extractToolInput(response);
    if (!output) throw new Error('Customer Service Agent returned no structured response');

    if (output.escalate) {
      eventBus.publish(EVENTS.ESCALATION_REQUIRED, {
        type: 'customer_service_escalation',
        channel,
        customerMessage,
        draftResponse: output.response,
        reason: output.escalationReason,
        jobId: job.id,
      });
    }

    // Send response back to the originating channel
    if (output.response && !output.escalate) {
      await this._sendResponse({ channel, customerId, response: output.response, tidioConversationId, tenantId });
    }

    return {
      response: output.response,
      intent: output.intent,
      sentiment: output.sentiment,
      sentimentScore: output.sentimentScore,
      resolved: output.resolved,
      escalated: output.escalate,
      escalationReason: output.escalationReason,
      suggestedProducts: output.suggestedProducts || [],
      followUpAction: output.followUpAction,
      channel,
      jobId: job.id,
    };
  }

  async _sendResponse({ channel, customerId, response, tidioConversationId, tenantId }) {
    try {
      if (channel === 'whatsapp' && customerId) {
        if (whatsappApi.isConfigured()) {
          await whatsappApi.sendTextMessage(customerId, response, tenantId);
          this.log.info('WhatsApp reply sent', { to: customerId });
        } else {
          this.log.warn('WhatsApp not configured — response not sent', { customerId });
        }
      } else if ((channel === 'website' || channel === 'tidio') && tidioConversationId) {
        if (tidioApi.isConfigured()) {
          await tidioApi.sendMessage(tidioConversationId, response);
          this.log.info('Tidio reply sent', { conversationId: tidioConversationId });
        } else {
          this.log.warn('Tidio not configured — response not sent', { tidioConversationId });
        }
      }
      // instagram_dm, facebook — replies go through Meta Graph API (future phase)
    } catch (err) {
      logger.error('Failed to send CS response to channel', { channel, error: err.message });
    }
  }

  async updateFAQ(job) {
    this.log.info('Updating FAQ knowledge base', { jobId: job.id });
    return { status: 'pending_implementation', jobId: job.id };
  }
}

module.exports = CustomerServiceAgent;
