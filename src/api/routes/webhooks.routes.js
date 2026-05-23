'use strict';

const { Router } = require('express');
const crypto = require('crypto');
const { enqueue } = require('../../orchestrator/message-queue');
const { getSupabaseClient } = require('../../services/database/supabase-client');
const { QUEUES, PRIORITY } = require('../../config/constants');
const logger = require('../../utils/logger');

const router = Router();

// ── Shopify ────────────────────────────────────────────────────────────────

/**
 * POST /webhooks/shopify
 *
 * Receives Shopify order, product, and inventory events.
 * Resolves the tenant from the shop domain header, then enqueues
 * the appropriate analytics job directly (bypassing eventBus so
 * tenantId is preserved).
 *
 * Required env: SHOPIFY_WEBHOOK_SECRET (can be per-tenant in future)
 */
router.post('/shopify', express_raw_body, async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (secret && hmac && !verifyShopifyHmac(req.rawBody, hmac, secret)) {
    logger.warn('Shopify webhook: invalid HMAC signature');
    return res.status(401).json({ error: 'Invalid Shopify webhook signature' });
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
 * The shop domain from the webhook header (e.g. my-store.myshopify.com) is
 * matched against the storeUrl field stored in the credentials JSONB column.
 */
async function resolveTenantByShopDomain(shopDomain) {
  if (!shopDomain) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  // Strip protocol if accidentally present; normalise to lowercase
  const normalised = shopDomain.toLowerCase().replace(/^https?:\/\//, '');

  const { data, error } = await supabase
    .from('tenant_credentials')
    .select('tenant_id')
    .eq('service', 'ecommerce')
    .eq('platform_type', 'shopify')
    // JSONB containment: credentials->storeUrl must contain the shop domain
    .filter('credentials->>storeUrl', 'ilike', `%${normalised}%`)
    .maybeSingle();

  if (error || !data) return null;
  return data.tenant_id;
}

/** Middleware: capture raw body for Shopify HMAC verification */
function express_raw_body(req, res, next) {
  let data = '';
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => { req.rawBody = data; next(); });
}

/** Constant-time HMAC comparison to prevent timing attacks */
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

module.exports = router;
