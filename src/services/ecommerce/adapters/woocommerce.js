'use strict';

const EcommerceAdapter = require('../base-adapter');
const logger = require('../../../utils/logger');

/**
 * WooCommerce REST API v3 adapter.
 * credentials: { siteUrl, consumerKey, consumerSecret }
 * siteUrl: full origin, e.g. https://mystore.com
 */
const PRIVATE_IP_RE = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|fd[0-9a-f]{2}:|169\.254\.)/i;

function validateStoreUrl(siteUrl) {
  let parsed;
  try { parsed = new URL(siteUrl); } catch { throw new Error('Invalid WooCommerce siteUrl'); }
  if (parsed.protocol !== 'https:') throw new Error('WooCommerce siteUrl must use HTTPS');
  if (PRIVATE_IP_RE.test(parsed.hostname)) throw new Error('WooCommerce siteUrl must not point to a private/internal host');
  return parsed.origin;
}

class WooCommerceAdapter extends EcommerceAdapter {
  constructor(credentials) {
    super(credentials);
    const { siteUrl, consumerKey, consumerSecret } = credentials;
    const safeOrigin = validateStoreUrl(siteUrl);
    this.baseUrl = `${safeOrigin}/wp-json/wc/v3`;
    this.authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  }

  async _request(path, method = 'GET', body = null) {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const opts = {
      method,
      headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' },
      signal: controller.signal,
    };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, opts);
      if (!res.ok) throw new Error(`WooCommerce ${method} ${path} → ${res.status}`);
      return res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async getProducts(opts = {}) {
    const { limit = 50, status = 'publish' } = opts;
    const params = new URLSearchParams({ per_page: String(limit), status });
    const data = await this._request(`/products?${params}`);
    return Array.isArray(data) ? data.map((p) => this._normalizeProduct(p)) : [];
  }

  async getProduct(id) {
    const data = await this._request(`/products/${id}`);
    return this._normalizeProduct(data);
  }

  async updateProduct(id, updates) {
    const data = await this._request(`/products/${id}`, 'PUT', updates);
    return this._normalizeProduct(data);
  }

  async getOrders(opts = {}) {
    const { limit = 50, status = 'any' } = opts;
    const params = new URLSearchParams({ per_page: String(limit), status });
    const orders = await this._request(`/orders?${params}`);
    return (Array.isArray(orders) ? orders : []).map((o) => ({
      id: String(o.id),
      createdAt: o.date_created,
      total: parseFloat(o.total),
      currency: o.currency,
      status: o.status,
      lineItems: (o.line_items || []).map((li) => ({
        productId: String(li.product_id),
        title: li.name,
        quantity: li.quantity,
        price: parseFloat(li.price),
      })),
    }));
  }

  async getInventoryLevels(productIds) {
    const results = [];
    for (const id of productIds) {
      try {
        const product = await this._request(`/products/${id}`);
        if (product.type === 'variable') {
          const variations = await this._request(`/products/${id}/variations?per_page=100`);
          results.push({
            productId: String(id),
            totalStock: (Array.isArray(variations) ? variations : []).reduce(
              (sum, v) => sum + (v.stock_quantity || 0), 0
            ),
            variants: (Array.isArray(variations) ? variations : []).map((v) => ({
              id: String(v.id),
              title: (v.attributes || []).map((a) => a.option).join(' / '),
              stock: v.stock_quantity,
            })),
          });
        } else {
          results.push({
            productId: String(id),
            totalStock: product.stock_quantity || 0,
            variants: [],
          });
        }
      } catch (err) {
        logger.warn(`WooCommerce: failed to get inventory for product ${id}`, { error: err.message });
      }
    }
    return results;
  }

  async getAnalytics(dateRange = {}) {
    const since = dateRange.since
      ? dateRange.since.split('T')[0]
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const until = dateRange.until
      ? dateRange.until.split('T')[0]
      : new Date().toISOString().split('T')[0];
    try {
      const report = await this._request(
        `/reports/sales?date_min=${since}&date_max=${until}&period=custom`
      );
      const row = Array.isArray(report) ? report[0] : report;
      return {
        orders: row?.total_orders || 0,
        revenue: parseFloat(row?.total_sales || 0),
        currency: this.credentials.currency || 'USD',
      };
    } catch {
      // Sales report may require specific permissions; fall back to order count
      const orders = await this.getOrders({ limit: 250, status: 'completed' });
      const revenue = orders.reduce((sum, o) => sum + o.total, 0);
      return { orders: orders.length, revenue, currency: 'USD' };
    }
  }

  _normalizeProduct(p) {
    return {
      id: String(p.id),
      title: p.name,
      description: p.description,
      status: p.status,
      // p.price is the WooCommerce computed effective price (lowest variant price for variable
      // products). sale_price/regular_price are empty strings on variable parent objects.
      price: parseFloat(p.price) || parseFloat(p.sale_price) || parseFloat(p.regular_price) || 0,
      currency: 'USD',
      variants: (p.variations || []).map((id) => ({ id: String(id) })),
      tags: (p.tags || []).map((t) => t.name),
      images: (p.images || []).map((i) => i.src),
      stockStatus: p.stock_status,
      stockQuantity: p.stock_quantity,
    };
  }
}

module.exports = WooCommerceAdapter;
