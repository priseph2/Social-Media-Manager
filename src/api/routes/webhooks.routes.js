'use strict';

const { Router } = require('express');
const crypto = require('crypto');
const { enqueue } = require('../../orchestrator/message-queue');
const { getSupabaseClient } = require('../../services/database/supabase-client');
const { QUEUES, PRIORITY } = require('../../config/constants');
const logger = require('../../utils/logger');

const whatsappApi = require('../../services/api-clients/whatsapp-api');

const router = Router();

// ── WhatsApp Business API ──────────────────────────────────────────────────

/**
 * GET /webhooks/whatsapp — Meta verification challenge
 * POST /webhooks/whatsapp — Incoming messages (HMAC-SHA256 verified)
 */
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

router.post('/whatsapp', async (req, res) => {
  // Verify Meta x-hub-signature-256 before processing
  const appSecret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
  const signature = req.headers['x-hub-signature-256'];
  if (appSecret) {
    if (!signature || !verifyMetaSignature(req.rawBody, signature, appSecret)) {
      logger.warn('WhatsApp webhook: invalid or missing signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } else {
    logger.warn('WhatsApp webhook received without META_APP_SECRET — signature not verified');
  }

  // Ack immediately after signature check — Meta requires 200 within 20s
  res.sendStatus(200);

  try {
    const entry = req.body?.entry;
    if (!Array.isArray(entry)) return;

    for (const e of entry) {
      for (const change of e.changes || []) {
        if (change.field !== 'messages') continue;

        const value = change.value || {};
        const messages = value.messages || [];
        const contacts = value.contacts || [];
        const phoneNumberId = value.metadata?.phone_number_id;

        // Resolve tenant from the receiving phone number ID
        const tenantId = await resolveTenantByPhoneNumberId(phoneNumberId).catch(() => null);

        for (const msg of messages) {
          // Only handle inbound text messages for now
          if (msg.type !== 'text' || !msg.text?.body) continue;

          const from = msg.from; // sender's phone number (E.164 without +)
          const contact = contacts.find((c) => c.wa_id === from);
          const customerName = contact?.profile?.name || null;

          // Mark as read (best-effort)
          if (whatsappApi.isConfigured()) {
            whatsappApi.markRead(msg.id, tenantId).catch(() => {});
          }

          logger.info('WhatsApp message received', { from, tenantId });

          await enqueue(
            QUEUES.CUSTOMER_SERVICE,
            'handle-inquiry',
            {
              tenantId,
              customerMessage: msg.text.body,
              channel: 'whatsapp',
              customerId: from,
              customerName,
            },
            { priority: PRIORITY.HIGH }
          ).catch((err) => logger.error('Failed to enqueue WhatsApp inquiry', { error: err.message }));
        }
      }
    }
  } catch (err) {
    logger.error('WhatsApp webhook processing error', { error: err.message });
  }
});

// ── Shopify ────────────────────────────────────────────────────────────────

/**
 * POST /webhooks/shopify
 *
 * Receives Shopify order, product, and inventory events.
 * Resolves the tenant from the shop domain header, then enqueues
 * the appropriate analytics job directly (bypassing eventBus so
 * tenantId is preserved).
 *
 * Required env: SHOPIFY_WEBHOOK_SECRET
 */
router.post('/shopify', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  // Require HMAC when a secret is configured; also reject when secret is set
  // but the header is absent — both indicate a tampered or spoofed request.
  if (secret) {
    if (!hmac || !verifyShopifyHmac(req.rawBody, hmac, secret)) {
      logger.warn('Shopify webhook: invalid or missing HMAC signature');
      return res.status(401).json({ error: 'Invalid Shopify webhook signature' });
    }
  } else {
    logger.warn('Shopify webhook received without SHOPIFY_WEBHOOK_SECRET — signature not verified');
  }

  const topic = req.headers['x-shopify-topic'];
  const shopDomain = req.headers['x-shopify-shop-domain'];

  logger.info(`Shopify webhook received: ${topic}`, { shopDomain });

  // Resolve which tenant owns this shop — non-blocking; best-effort
  const tenantId = await resolveTenantByShopDomain(shopDomain).catch(() => null);

  switch (topic) {
    case 'orders/create':
    case 'orders/paid': {
      const order = req.body;

      await Promise.allSettled([
        // Spike analysis
        enqueue(QUEUES.ANALYTICS, 'analyse-sales-spike',
          { source: 'shopify', topic, order, tenantId, shopDomain },
          { priority: PRIORITY.HIGH }
        ),
        // Revenue attribution — links this order to the content that drove it
        enqueue(QUEUES.ANALYTICS, 'attribute-revenue',
          {
            tenantId,
            platform: 'shopify',
            order: {
              id: order.id || order.name,
              createdAt: order.created_at,
              total: parseFloat(order.total_price || 0),
              currency: order.currency,
              lineItems: (order.line_items || []).map((li) => ({
                productId: String(li.product_id),
                title: li.title,
                quantity: li.quantity,
                price: parseFloat(li.price),
              })),
            },
          },
          { priority: PRIORITY.NORMAL }
        ),
        // Immediate metrics refresh
        enqueue(QUEUES.ANALYTICS, 'aggregate-daily-metrics',
          { date: new Date().toISOString(), tenantId, trigger: 'shopify_order_webhook' },
          { priority: PRIORITY.NORMAL }
        ),
      ]).then((results) => {
        results.filter((r) => r.status === 'rejected').forEach((r) =>
          logger.error('Failed to enqueue webhook job', { reason: r.reason?.message })
        );
      });
      break;
    }

    case 'orders/cancelled':
    case 'orders/refunded': {
      // Trigger a lightweight aggregation so revenue figures stay accurate
      await enqueue(
        QUEUES.ANALYTICS,
        'aggregate-daily-metrics',
        { date: new Date().toISOString(), tenantId, trigger: `shopify_${topic.replace('/', '_')}` },
        { priority: PRIORITY.LOW }
      ).catch(() => {});
      break;
    }

    case 'inventory_levels/update': {
      // Could trigger e-commerce optimizer; log for now
      logger.info('Shopify inventory update received', { tenantId, shopDomain });
      break;
    }

    case 'products/update':
    case 'products/create': {
      logger.info(`Shopify product event: ${topic}`, { tenantId });
      break;
    }

    default:
      logger.info(`Shopify webhook topic not handled: ${topic}`);
  }

  // Shopify requires a 200 within 5 seconds
  res.sendStatus(200);
});

// ── Tidio ──────────────────────────────────────────────────────────────────

/**
 * POST /webhooks/tidio
 *
 * Receives new visitor messages from Tidio live chat.
 * Passes them into the customer service queue and, if the AI resolves
 * the inquiry, uses the Tidio API to reply in-thread.
 *
 * Expected body (Tidio webhook payload):
 *   { message, visitorId, conversationId, channel }
 */
router.post('/tidio', async (req, res) => {
  const { message, visitorId, conversationId, channel = 'website' } = req.body;
  if (!message) return res.sendStatus(400);

  logger.info('Tidio webhook received', { conversationId, channel });

  await enqueue(
    QUEUES.CUSTOMER_SERVICE,
    'handle-inquiry',
    {
      customerMessage: message,
      channel,
      customerId: visitorId,
      // Pass conversationId so the customer-service skill can reply via Tidio API
      tidioConversationId: conversationId,
    },
    { priority: PRIORITY.HIGH }
  ).catch((err) => logger.error('Failed to enqueue Tidio inquiry', { error: err.message }));

  res.sendStatus(200);
});

// ── Meta / Instagram ───────────────────────────────────────────────────────

/**
 * GET /webhooks/meta  — verification challenge
 * POST /webhooks/meta — message events (Instagram DM, Facebook Messenger)
 */
router.get('/meta', (req, res) => {
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
        if (msg?.text?.body) {
          await enqueue(
            QUEUES.CUSTOMER_SERVICE,
            'handle-inquiry',
            {
              customerMessage: msg.text.body,
              channel: 'instagram_dm',
              customerId: msg.from,
            },
            { priority: PRIORITY.HIGH }
          ).catch((err) => logger.error('Failed to enqueue Meta inquiry', { error: err.message }));
        }
      }
    }
  }
  res.sendStatus(200);
});

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolves a Supabase tenantId by matching the Shopify shop domain against
 * credentials stored in tenant_credentials (service = 'ecommerce', platform_type = 'shopify').
 *
 * Uses exact equality on the normalised domain to prevent LIKE wildcard injection.
 */
async function resolveTenantByShopDomain(shopDomain) {
  if (!shopDomain) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  // Strip protocol and trailing slash; lowercase; reject wildcards
  const normalised = shopDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Validate: shop domains must be valid hostnames (alphanumeric, hyphens, dots)
  if (!/^[a-z0-9][a-z0-9\-.]+$/.test(normalised)) {
    logger.warn('resolveTenantByShopDomain: invalid shop domain rejected', { shopDomain });
    return null;
  }

  // Exact match on the stored storeUrl (normalised form)
  const { data, error } = await supabase
    .from('tenant_credentials')
    .select('tenant_id')
    .eq('service', 'ecommerce')
    .eq('platform_type', 'shopify')
    .filter('credentials->>storeUrl', 'eq', normalised)
    .maybeSingle();

  if (error || !data) return null;
  return data.tenant_id;
}

/**
 * Resolves a tenant from the WhatsApp phone number ID stored in tenant_credentials
 * (service = 'whatsapp', credentials->phoneNumberId).
 */
async function resolveTenantByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('tenant_credentials')
    .select('tenant_id')
    .eq('service', 'whatsapp')
    .filter('credentials->>phoneNumberId', 'eq', phoneNumberId)
    .maybeSingle();
  if (error || !data) return null;
  return data.tenant_id;
}

/** Constant-time HMAC-SHA256 comparison to prevent timing attacks (Shopify) */
function verifyShopifyHmac(body, hmac, secret) {
  try {
    const hash = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
    const a = Buffer.from(hash);
    const b = Buffer.from(hmac);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Constant-time HMAC-SHA256 comparison for Meta/WhatsApp webhooks */
function verifyMetaSignature(body, signature, secret) {
  try {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

module.exports = router;
