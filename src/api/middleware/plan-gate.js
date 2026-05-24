'use strict';

const { checkFeature, hasOpsRemaining, getEffectivePlan, getSubscription } = require('../../services/billing/subscription');
const logger = require('../../utils/logger');

/**
 * Middleware: blocks the request if the tenant's plan does not include `feature`.
 *
 * Usage:
 *   router.post('/route', authenticate, requireFeature('emailCampaigns'), handler)
 */
function requireFeature(feature) {
  return async (req, res, next) => {
    try {
      const enabled = await checkFeature(req.tenantId, feature);
      if (!enabled) {
        const plan = await getEffectivePlan(req.tenantId);
        return res.status(403).json({
          error: 'Feature not available on your current plan',
          feature,
          currentPlan: plan,
          upgradeRequired: true,
        });
      }
      next();
    } catch (err) {
      logger.warn('plan-gate requireFeature error', { error: err.message, feature });
      next(); // fail open so a billing bug never breaks core functionality
    }
  };
}

/**
 * Middleware: blocks the request if one of the required plans is not active.
 *
 * Usage:
 *   router.get('/route', authenticate, requirePlan('growth', 'agency'), handler)
 */
function requirePlan(...allowedPlans) {
  return async (req, res, next) => {
    try {
      const plan = await getEffectivePlan(req.tenantId);
      if (!allowedPlans.includes(plan)) {
        return res.status(403).json({
          error: `This endpoint requires one of: ${allowedPlans.join(', ')}`,
          currentPlan: plan,
          upgradeRequired: true,
        });
      }
      next();
    } catch (err) {
      logger.warn('plan-gate requirePlan error', { error: err.message });
      next();
    }
  };
}

/**
 * Middleware: blocks the request if the tenant has used all their monthly AI operations.
 * Must run after authenticate (needs req.tenantId).
 *
 * Usage:
 *   router.post('/generate', authenticate, checkOpsLimit, handler)
 */
async function checkOpsLimit(req, res, next) {
  if (!req.tenantId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const remaining = await hasOpsRemaining(req.tenantId);
    if (!remaining) {
      const plan = await getEffectivePlan(req.tenantId);
      return res.status(402).json({
        error: 'Monthly AI operations limit reached. Upgrade your plan or wait for the next billing cycle.',
        currentPlan: plan,
        upgradeRequired: true,
      });
    }
    next();
  } catch (err) {
    logger.warn('plan-gate checkOpsLimit error', { error: err.message });
    next(); // fail open
  }
}

/**
 * Middleware: attaches subscription + plan info to req for downstream use.
 * Non-blocking — missing subscription does not fail the request.
 */
async function attachSubscription(req, res, next) {
  try {
    if (req.tenantId) {
      const sub = await getSubscription(req.tenantId);
      req.subscription = sub;
      req.tenantPlan = await getEffectivePlan(req.tenantId);
    }
  } catch (err) {
    logger.debug('attachSubscription failed (non-fatal)', { error: err.message });
  }
  next();
}

module.exports = { requireFeature, requirePlan, checkOpsLimit, attachSubscription };
