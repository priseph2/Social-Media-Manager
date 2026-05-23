'use strict';

const EcommerceAdapter = require('../base-adapter');
const logger = require('../../../utils/logger');

class ShopifyAdapter extends EcommerceAdapter {
  constructor(credentials) {
    super(credentials);
    // credentials: { storeUrl, accessToken }
    this.baseUrl = `https://${credentials.storeUrl}/admin/api/2024-01`;
    this.headers = {
      'X-Shopify-Access-Token': credentials.accessToken,
      'Content-Type': 'application/json',
    };
  }

  async _request(path, method = 'GET', body = null) {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
    const opts = { method, headers: this.headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${this.baseUrl}${path}`, opts);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API ${method} ${path} → ${res.status}: ${text}`);
    }
    return res.json();
  }

  async getProducts(opts = {}) {
    const { limit = 50, status = 'active' } = opts;
    const data = await this._request(`/products.json?limit=${limit}&status=${status}`);
    return (data.products || []).map(this._normalizeProduct);
  }

  async getProduct(id) {
    const data = await this._request(`/products/${id}.json`);
    return this._normalizeProduct(data.product);
  }

  async updateProduct(id, updates) {
    const data = await this._request(`/products/${id}.json`, 'PUT', { product: updates });
    return this._normalizeProduct(data.product);
  }

  async getOrders(opts = {}) {
    const { limit = 50, status = 'any' } = opts;
    const data = await this._request(`/orders.json?limit=${limit}&status=${status}`);
    return (data.orders || []).map((o) => ({
      id: String(o.id),
      createdAt: o.created_at,
      total: parseFloat(o.total_price),
      currency: o.currency,
      status: o.financial_status,
      lineItems: (o.line_items || []).map((li) => ({
        productId: String(li.product_id),
        title: li.title,
        quantity: li.quantity,
        price: parseFloat(li.price),
      })),
    }));
  }

  async getInventoryLevels(productIds) {
    const results = [];
    for (const id of productIds) {
      try {
        const data = await this._request(`/products/${id}/variants.json`);
        const variants = data.variants || [];
        results.push({
          productId: String(id),
          totalStock: variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
          variants: variants.map((v) => ({ id: String(v.id), title: v.title, stock: v.inventory_quantity })),
        });
      } catch (err) {
        logger.warn(`Failed to get inventory for product ${id}`, { error: err.message });
      }
    }
    return results;
  }

  async getAnalytics(dateRange = {}) {
    // Shopify doesn't expose analytics via REST; return order-based summary
    const { since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() } = dateRange;
    const data = await this._request(`/orders.json?status=paid&created_at_min=${since}&limit=250`);
    const orders = data.orders || [];
    const revenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    return { orders: orders.length, revenue, currency: orders[0]?.currency || 'USD' };
  }

  _normalizeProduct(p) {
    return {
      id: String(p.id),
      title: p.title,
      description: p.body_html,
      status: p.status,
      price: parseFloat(p.variants?.[0]?.price || 0),
      currency: 'USD',
      variants: (p.variants || []).map((v) => ({ id: String(v.id), title: v.title, price: parseFloat(v.price), stock: v.inventory_quantity })),
      tags: p.tags ? p.tags.split(',').map((t) => t.trim()) : [],
      images: (p.images || []).map((i) => i.src),
    };
  }
}

module.exports = ShopifyAdapter;
