'use strict';

const crypto = require('crypto');
const logger = require('../../utils/logger');

const BASE_URL = 'https://api.paystack.co';

/**
 * Paystack API client.
 *
 * Required env:
 *   PAYSTACK_SECRET_KEY  — sk_live_… or sk_test_…
 *   PAYSTACK_PUBLIC_KEY  — pk_live_… or pk_test_… (returned to frontend)
 */
class PaystackClient {
  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.publicKey = process.env.PAYSTACK_PUBLIC_KEY;
    this.available = Boolean(this.secretKey);
    if (!this.available) logger.warn('Paystack not configured — billing disabled.');
  }

  get _headers() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async _request(method, path, body = null) {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
    const opts = { method, headers: this._headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${path}`, opts);
    const json = await res.json();
    if (!res.ok || !json.status) {
      throw new Error(`Paystack ${method} ${path} → ${res.status}: ${json.message || JSON.stringify(json)}`);
    }
    return json.data;
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  /**
   * Creates or fetches a Paystack customer.
   * Returns the customer object including customer_code.
   */
  async createCustomer({ email, firstName, lastName, phone = null }) {
    return this._request('POST', '/customer', { email, first_name: firstName, last_name: lastName, phone });
  }

  async fetchCustomer(emailOrCode) {
    return this._request('GET', `/customer/${encodeURIComponent(emailOrCode)}`);
  }

  // ── Transactions (one-off payments and subscription initialization) ───────

  /**
   * Initializes a transaction.
   * For subscriptions, pass planCode and the returned authorization_url will
   * start the subscription after payment.
   *
   * amount: in the smallest currency unit (kobo for NGN, cents for USD)
   * Returns: { authorization_url, access_code, reference }
   */
  async initializeTransaction({ email, amount, currency = 'NGN', planCode = null, callbackUrl = null, metadata = {} }) {
    const body = { email, amount, currency, metadata };
    if (planCode) body.plan = planCode;
    if (callbackUrl) body.callback_url = callbackUrl;
    return this._request('POST', '/transaction/initialize', body);
  }

  /**
   * Verifies a transaction by reference.
   * Returns full transaction object including customer, authorization, subscription.
   */
  async verifyTransaction(reference) {
    return this._request('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  /**
   * Creates a subscription directly (for tenants who already have an auth code).
   */
  async createSubscription({ customerCode, planCode, authorizationCode, startDate = null }) {
    const body = { customer: customerCode, plan: planCode, authorization: authorizationCode };
    if (startDate) body.start_date = startDate;
    return this._request('POST', '/subscription', body);
  }

  /**
   * Fetches a subscription by code.
   */
  async fetchSubscription(subscriptionCode) {
    return this._request('GET', `/subscription/${encodeURIComponent(subscriptionCode)}`);
  }

  /**
   * Cancels a subscription (disables it from renewing).
   * emailToken is sent to the customer's email by Paystack for confirmation;
   * for server-side cancellation use the subscription code directly.
   */
  async cancelSubscription(subscriptionCode, emailToken) {
    return this._request('POST', '/subscription/disable', {
      code: subscriptionCode,
      token: emailToken,
    });
  }

  /**
   * Lists all subscriptions for a customer.
   */
  async listCustomerSubscriptions(customerCode) {
    return this._request('GET', `/subscription?customer=${encodeURIComponent(customerCode)}`);
  }

  // ── Plans ─────────────────────────────────────────────────────────────────

  async fetchPlan(planCode) {
    return this._request('GET', `/plan/${encodeURIComponent(planCode)}`);
  }

  // ── Webhook verification ──────────────────────────────────────────────────

  /**
   * Verifies a Paystack webhook request using HMAC-SHA512.
   * Returns true if the signature matches.
   */
  verifyWebhookSignature(rawBody, signature) {
    if (!this.secretKey || !signature) return false;
    try {
      const hash = crypto.createHmac('sha512', this.secretKey).update(rawBody, 'utf8').digest('hex');
      const a = Buffer.from(hash, 'hex');
      const b = Buffer.from(signature, 'hex');
      // timingSafeEqual throws if lengths differ; reject mismatched lengths explicitly
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}

module.exports = new PaystackClient();
