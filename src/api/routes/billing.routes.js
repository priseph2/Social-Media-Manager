'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getSubscription, getEffectivePlan, getRemainingOps,
  upsertSubscription, schedulePlanChange, cancelAtPeriodEnd, logBillingEvent,
} = require('../../services/billing/subscription');
const { getMonthlyUsage, getSkillBreakdown } = require('../../services/billing/usage-meter');
const paystack = require('../../services/billing/paystack');
const { getPlan, PLANS } = require('../../config/plans');
const logger = require('../../utils/logger');

const router = Router();

// ── Plan & usage overview ─────────────────────────────────────────────────

/**
 * GET /api/billing/plan
 * Returns current plan, subscription status, usage, and limits.
 */
router.get('/plan', authenticate, async (req, res) => {
  try {
    const [sub, plan, usage, remaining] = await Promise.all([
      getSubscription(req.tenantId),
      getEffectivePlan(req.tenantId),
      getMonthlyUsage(req.tenantId),
      getRemainingOps(req.tenantId),
    ]);

    const planConfig = getPlan(plan);

    res.json({
      subscription: {
        plan,
        status: sub.status,
        trialEndsAt: sub.trial_ends_at,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        pendingPlan: sub.pending_plan,
      },
      planConfig: {
        name: planConfig.name,
        priceUSD: planConfig.priceUSD,
        priceNGN: planConfig.priceNGN,
        limits: planConfig.limits,
        features: planConfig.features,
      },
      usage: {
        billingPeriod: usage.billingPeriod,
        totalOps: usage.totalOps,
        opsLimit: planConfig.limits.monthlyAiOps === Infinity ? null : planConfig.limits.monthlyAiOps,
        remainingOps: remaining === Infinity ? null : remaining,
        totalCostUsd: usage.totalCostUsd,
      },
    });
  } catch (err) {
    logger.error('GET /billing/plan error', { error: err.message });
    res.status(500).json({ error: 'Failed to load billing info' });
  }
});

/**
 * GET /api/billing/usage
 * Returns per-skill usage breakdown for the current billing period.
 */
router.get('/usage', authenticate, async (req, res) => {
  try {
    const period = req.query.period; // optional 'YYYY-MM'
    const [summary, breakdown] = await Promise.all([
      getMonthlyUsage(req.tenantId, period),
      getSkillBreakdown(req.tenantId, period),
    ]);
    res.json({ ...summary, breakdown });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load usage data' });
  }
});

/**
 * GET /api/billing/plans
 * Returns all available plans for the upgrade UI.
 */
router.get('/plans', authenticate, async (req, res) => {
  const plans = Object.values(PLANS).map(({ id, name, priceUSD, priceNGN, limits, features }) => ({
    id, name, priceUSD, priceNGN, limits: {
      ...limits,
      monthlyAiOps: limits.monthlyAiOps === Infinity ? null : limits.monthlyAiOps,
      maxBrands: limits.maxBrands === Infinity ? null : limits.maxBrands,
    }, features,
  }));
  res.json({ plans });
});

// ── Checkout & payment ────────────────────────────────────────────────────

/**
 * POST /api/billing/checkout
 * Creates a Paystack payment initialization URL for a plan subscription.
 *
 * Body: { plan: 'growth' | 'agency', currency?: 'NGN' | 'USD' }
 */
router.post('/checkout', authenticate, async (req, res) => {
  if (!paystack.available) {
    return res.status(503).json({ error: 'Payment processing not configured' });
  }

  const { plan, currency = 'NGN' } = req.body;
  const planConfig = getPlan(plan);
  if (!planConfig?.paystackPlanCode) {
    return res.status(400).json({ error: `Plan "${plan}" is not available for purchase` });
  }

  try {
    const sub = await getSubscription(req.tenantId);
    const email = req.userEmail;
    if (!email) return res.status(400).json({ error: 'User email required for checkout' });

    const amountKobo = currency === 'NGN' ? planConfig.priceNGN * 100 : planConfig.priceUSD * 100;
    const callbackUrl = `${process.env.DASHBOARD_URL || 'http://localhost:3001'}/dashboard/settings/billing?payment=verify`;

    const txData = await paystack.initializeTransaction({
      email,
      amount: amountKobo,
      currency,
      planCode: planConfig.paystackPlanCode,
      callbackUrl,
      metadata: {
        tenant_id: req.tenantId,
        plan,
        custom_fields: [
          { display_name: 'Plan', variable_name: 'plan', value: planConfig.name },
          { display_name: 'Tenant ID', variable_name: 'tenant_id', value: req.tenantId },
        ],
      },
    });

    await logBillingEvent(req.tenantId, 'checkout.initiated', { plan, currency, reference: txData.reference });

    res.json({
      authorizationUrl: txData.authorization_url,
      reference: txData.reference,
      publicKey: paystack.publicKey,
    });
  } catch (err) {
    logger.error('POST /billing/checkout error', { error: err.message });
    res.status(502).json({ error: err.message });
  }
});

/**
 * POST /api/billing/verify
 * Verifies a Paystack transaction after the checkout redirect.
 * Body: { reference: 'PAYSTACK_REFERENCE' }
 */
router.post('/verify', authenticate, async (req, res) => {
  const { reference } = req.body;
  if (!reference) return res.status(400).json({ error: 'reference required' });

  try {
    const tx = await paystack.verifyTransaction(reference);
    if (tx.status !== 'success') {
      return res.status(402).json({ error: 'Payment not successful', status: tx.status });
    }

    const plan = tx.metadata?.plan || tx.plan?.name;
    const subscriptionCode = tx.subscription?.subscription_code;
    const customerCode = tx.customer?.customer_code;
    const authCode = tx.authorization?.authorization_code;

    await upsertSubscription(req.tenantId, {
      plan,
      status: 'active',
      paystack_customer_code: customerCode,
      paystack_subscription_code: subscriptionCode,
      authorization_code: authCode,
      current_period_start: new Date().toISOString(),
      current_period_end: tx.subscription?.next_payment_date || null,
      trial_ends_at: null,
    });

    await logBillingEvent(req.tenantId, 'payment.succeeded', { reference, plan, amount: tx.amount });

    res.json({ success: true, plan, status: 'active' });
  } catch (err) {
    logger.error('POST /billing/verify error', { error: err.message });
    res.status(502).json({ error: err.message });
  }
});

// ── Plan management ───────────────────────────────────────────────────────

/**
 * PUT /api/billing/plan
 * Schedules a plan change (effective at end of current billing cycle).
 * Body: { plan: 'starter' | 'growth' | 'agency' }
 */
router.put('/plan', authenticate, async (req, res) => {
  const { plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: `Unknown plan: ${plan}` });

  try {
    await schedulePlanChange(req.tenantId, plan);
    await logBillingEvent(req.tenantId, 'plan.change_scheduled', { pendingPlan: plan });
    res.json({ success: true, pendingPlan: plan, message: 'Plan change will take effect at the end of your current billing period.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/billing/subscription
 * Cancels the subscription at end of current billing period.
 */
router.delete('/subscription', authenticate, async (req, res) => {
  try {
    const sub = await getSubscription(req.tenantId);
    if (sub.paystack_subscription_code && paystack.available) {
      // Paystack requires the email token for client-initiated cancellation.
      // For server-side, pass the subscription code and a dummy token;
      // in production, use the management link from Paystack instead.
      logger.info('Cancelling Paystack subscription', { tenantId: req.tenantId });
    }

    await cancelAtPeriodEnd(req.tenantId);
    await logBillingEvent(req.tenantId, 'subscription.cancel_scheduled', {});

    res.json({
      success: true,
      message: 'Your subscription will be cancelled at the end of the current billing period.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Paystack webhook ──────────────────────────────────────────────────────

/**
 * POST /webhooks/paystack
 * Handles Paystack asynchronous events (mounted separately in app.js under /webhooks).
 * HMAC-SHA512 verified using the secret key.
 */
router.post('/paystack', capture_raw_body, async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  if (!paystack.verifyWebhookSignature(req.rawBody, signature)) {
    logger.warn('Paystack webhook: invalid signature');
    return res.status(401).send('Invalid signature');
  }

  const { event, data } = req.body;
  logger.info(`Paystack webhook: ${event}`);

  // Resolve tenant from metadata
  const tenantId = data?.metadata?.tenant_id
    || data?.customer?.metadata?.tenant_id
    || null;

  try {
    await handlePaystackEvent(event, data, tenantId);
  } catch (err) {
    logger.error(`Paystack webhook handler error for ${event}`, { error: err.message });
  }

  // Always return 200 so Paystack doesn't retry
  res.sendStatus(200);
});

async function handlePaystackEvent(event, data, tenantId) {
  switch (event) {
    case 'charge.success': {
      if (!tenantId) return;
      const plan = data.metadata?.plan;
      if (!plan) return;
      await upsertSubscription(tenantId, {
        plan,
        status: 'active',
        paystack_customer_code: data.customer?.customer_code,
        authorization_code: data.authorization?.authorization_code,
        current_period_start: new Date().toISOString(),
      });
      await logBillingEvent(tenantId, 'payment.succeeded', { plan, amount: data.amount, reference: data.reference });
      break;
    }

    case 'subscription.create': {
      if (!tenantId) return;
      await upsertSubscription(tenantId, {
        paystack_subscription_code: data.subscription_code,
        paystack_plan_code: data.plan?.plan_code,
        status: 'active',
        current_period_start: data.createdAt,
        current_period_end: data.next_payment_date,
      });
      await logBillingEvent(tenantId, 'subscription.created', data);
      break;
    }

    case 'subscription.not_renew':
    case 'subscription.disable': {
      if (!tenantId) return;
      await upsertSubscription(tenantId, { status: 'cancelled', cancelled_at: new Date().toISOString() });
      await logBillingEvent(tenantId, 'subscription.cancelled', data);
      break;
    }

    case 'invoice.payment_failed': {
      if (!tenantId) return;
      await upsertSubscription(tenantId, { status: 'past_due' });
      await logBillingEvent(tenantId, 'payment.failed', data);
      break;
    }

    case 'invoice.update': {
      // Renewal succeeded — update billing period
      if (!tenantId) return;
      const pendingSub = await getSubscription(tenantId);
      const updates = { status: 'active', current_period_end: data.next_payment_date };
      if (pendingSub.pending_plan) {
        updates.plan = pendingSub.pending_plan;
        updates.pending_plan = null;
      }
      await upsertSubscription(tenantId, updates);
      await logBillingEvent(tenantId, 'payment.succeeded.renewal', { amount: data.amount });
      break;
    }

    default:
      logger.debug(`Paystack: unhandled event ${event}`);
  }
}

function capture_raw_body(req, res, next) {
  const chunks = [];
  req.on('data', (chunk) => { chunks.push(chunk); });
  req.on('end', () => { req.rawBody = Buffer.concat(chunks).toString('utf8'); next(); });
}

module.exports = router;
