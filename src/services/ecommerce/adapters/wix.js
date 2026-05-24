'use strict';

const EcommerceAdapter = require('../base-adapter');
const logger = require('../../../utils/logger');

/**
 * Wix Stores REST API adapter.
 * credentials: { siteId, accessToken, accountId? }
 * Uses the Wix Headless Store API (query-based pattern).
 */
const WIX_ID_RE = /^[a-zA-Z0-9_\-]{1,64}$/;

class WixAdapter extends EcommerceAdapter {
  constructor(credentials) {
    super(credentials);
    const { siteId, accountId, accessToken } = credentials;
    if (siteId && !WIX_ID_RE.test(siteId)) throw new Error('Invalid Wix siteId format');
    if (accountId && !WIX_ID_RE.test(accountId)) throw new Error('Invalid Wix accountId format');
    this.baseUrl = 'https://www.wixapis.com/stores/v1';
    this.headers = {
      Authorization: accessToken,
      'Content-Type': 'application/json',
      ...(siteId && { 'wix-site-id': siteId }),
      ...(accountId && { 'wix-account-id': accountId }),
    };
  }

  async _request(path, method = 'GET', body = null) {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const opts = { method, headers: this.headers, signal: controller.signal };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, opts);
      if (!res.ok) throw new Error(`Wix ${method} ${path} → ${res.status}`);
      return res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async getProducts(opts = {}) {
    const { limit = 50 } = opts;
    const PAGE_SIZE = Math.min(limit, 100); // Wix Stores max page size is 100
    const allProducts = [];
    let offset = 0;

    while (allProducts.length < limit) {
      const pageLimit = Math.min(PAGE_SIZE, limit - allProducts.length);
      const data = await this._request('/products/query', 'POST', {
        query: {
          paging: { limit: pageLimit, offset },
          filter: JSON.stringify({ visible: true }),
        },
      });
      const page = data.products || [];
      allProducts.push(...page.map((p) => this._normalizeProduct(p)));
      // Stop if this was the last page
      if (page.length < pageLimit) break;
      offset += page.length;
    }

    return allProducts;
  }

  async getProduct(id) {
    const data = await this._request(`/products/${id}`);
    return this._normalizeProduct(data.product);
  }

  async updateProduct(id, updates) {
    // Wix uses PATCH-like partial update via updateProductFields
    const data = await this._request(`/products/${id}`, 'PUT', { product: updates });
    return this._normalizeProduct(data.product);
  }

  async getOrders(opts = {}) {
    const { limit = 50 } = opts;
    const data = await this._request('/orders/query', 'POST', {
      query: { paging: { limit, offset: 0 } },
    });
    return (data.orders || []).map((o) => ({
      id: o.id,
      createdAt: o.dateCreated,
      total: parseFloat(o.totals?.total || 0),
      currency: o.currency,
      status: o.paymentStatus,
      lineItems: (o.lineItems || []).map((li) => ({
        productId: li.productId,
        title: li.name,
        quantity: li.quantity,
        price: parseFloat(li.price || 0),
      })),
    }));
  }

  async getInventoryLevels(productIds) {
    const results = [];
    for (const id of productIds) {
      try {
        const data = await this._request(`/products/${id}`);
        const product = data.product;
        const variants = product?.variants || [];
        results.push({
          productId: id,
          totalStock: variants.reduce((sum, v) => sum + (v.stock?.quantity || 0), 0),
          variants: variants.map((v) => ({
            id: v.id,
            title: Object.values(v.choices || {}).join(' / '),
            stock: v.stock?.quantity,
          })),
        });
      } catch (err) {
        logger.warn(`Wix: failed to get inventory for product ${id}`, { error: err.message });
      }
    }
    return results;
  }

  async getAnalytics(dateRange = {}) {
    const since = dateRange.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const data = await this._request('/orders/query', 'POST', {
        query: {
          paging: { limit: 250, offset: 0 },
          filter: JSON.stringify({
            dateCreated: { $gte: since },
            paymentStatus: 'PAID',
          }),
        },
      });
      const orders = data.orders || [];
      const revenue = orders.reduce((sum, o) => sum + parseFloat(o.totals?.total || 0), 0);
      return { orders: orders.length, revenue, currency: orders[0]?.currency || 'USD' };
    } catch {
      return { orders: 0, revenue: 0, currency: 'USD' };
    }
  }

  _normalizeProduct(p) {
    return {
      id: p.id,
      title: p.name,
      description: p.description,
      status: p.visible ? 'active' : 'draft',
      price: parseFloat(p.price?.amount || 0),
      currency: p.price?.currency || 'USD',
      variants: (p.variants || []).map((v) => ({
        id: v.id,
        title: Object.values(v.choices || {}).join(' / '),
        price: parseFloat(v.variant?.priceData?.price || p.price?.amount || 0),
        stock: v.stock?.quantity,
      })),
      tags: p.productType ? [p.productType] : [],
      images: (p.media?.items || []).map((m) => m.image?.url).filter(Boolean),
    };
  }
}

module.exports = WixAdapter;
