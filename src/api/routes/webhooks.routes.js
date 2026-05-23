'use strict';

const { Router } = require('express');
const crypto = require('crypto');
const orchestrator = require('../../orchestrator/orchestrator');
const { eventBus, EVENTS } = require('../../services/messaging/event-emitter');
const logger = require('../../utils/logger');

const router = Router();

/**
 * POST /webhooks/shopify
 * Receives Shopify order and inventory events.
 */
router.post('/shopify', express_raw_body, async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (secret && !verifyShopifyHmac(req.rawBody, hmac, secret)) {
    return res.status(401).json({ error: 'Invalid Shopify webhook signature' });
  }

  const topic = req.headers['x-shopify-topic'];
  logger.info(`Shopify webhook: ${topic}`);

  if (topic === 'orders/create') {
    eventBus.publish(EVENTS.SALES_SPIKE, { source: 'shopify', order: req.body });
  }

  res.sendStatus(200);
});

/**
 * POST /webhooks/tidio
 * Receives new customer messages from Tidio live chat.
 */
router.post('/tidio', async (req, res) => {
  const { message, visitorId, channel = 'website' } = req.body;
  if (!message) return res.sendStatus(400);

  await orchestrator.handleCustomerInquiry({
    customerMessage: message,
    channel,
    customerId: visitorId,
  });

  res.sendStatus(200);
});

/**
 * POST /webhooks/meta
 * Handles Meta webhook verification and event forwarding.
 */
router.get('/meta', (req, res) => {
  // Webhook verification challenge
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

router.post('/meta', async (req, res) => {
  const { entry } = req.body;
  if (!entry?.length) return res.sendStatus(200);

  for (const e of entry) {
    for (const change of e.changes || []) {
      if (change.field === 'messages') {
        const msg = change.value?.messages?.[0];
        if (msg) {
          await orchestrator.handleCustomerInquiry({
            customerMessage: msg.text?.body || '',
            channel: 'instagram_dm',
            customerId: msg.from,
          });
        }
      }
    }
  }
  res.sendStatus(200);
});

// Middleware to capture raw body for Shopify HMAC verification
function express_raw_body(req, res, next) {
  let data = '';
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => { req.rawBody = data; next(); });
}

function verifyShopifyHmac(body, hmac, secret) {
  const hash = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
}

module.exports = router;
