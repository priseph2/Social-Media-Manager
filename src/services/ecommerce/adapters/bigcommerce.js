'use strict';

const EcommerceAdapter = require('../base-adapter');
const logger = require('../../../utils/logger');

/**
 * BigCommerce REST API adapter.
 * credentials: { storeHash, accessToken }
 * Uses v3 for catalog (products/variants) and v2 for orders.
 */
class BigCommerceAdapter extends EcommerceAdapter {
  constructor(credentials) {
    super(credentials);
    const { storeHash, accessToken } = credentials;
    this.baseV3 = `https://api.bigcommerce.com/stores/${storeHash}/v3`;
    this.baseV2 = `https://api.bigcommerce.com/stores/${storeHash}/v2`;
    this.headers = {
      'X-Auth-Token': accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async _request(url, method = 'GET', body = null) {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
    const opts = { method, headers: this.headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`BigCommerce ${method} ${url} → ${res.status}: ${text}`);
    }
    return res.json();
  }

  async getProducts(opts = {}) {
    const { limit = 50 } = opts;
    const params = new URLSearchParams({ page: '1', limit: String(limit), is_visible: 'true' });
    const data = await this._request(`${this.baseV3}/catalog/products?${params}`);
    return (data.data || []).map((p) => this._normalizeProduct(p));
  }

  async getProduct(id) {
    const data = await this._request(`${this.baseV3}/catalog/products/${id}`);
    return this._normalizeProduct(data.data);
  }

  async updateProduct(id, updates) {
    const data = await this._request(`${this.baseV3}/catalog/products/${id}`, 'PUT', updates);
    return this._normalizeProduct(data.data);
  }

  async getOrders(opts = {}) {
    const { limit = 50, status } = opts;
    const params = new URLSearchParams({ page: '1', limit: String(limit) });
    if (status && status !== 'any') params.set('status_id', status);
    const orders = await this._request(`${this.baseV2}/orders?${params}`);
    return (Array.isArray(orders) ? orders : []).map((o) => ({
      id: String(o.id),
      createdAt: o.date_created,
      total: parseFloat(o.total_inc_tax),
      currency: o.currency_code,
      status: o.status,
      lineItems: [],  // BC requires a separate call per order; omitted for listing
    }));
  }

  async getInventoryLevels(productIds) {
    const results = [];
    for (const id of productIds) {
      try {
        const data = await this._request(`${this.baseV3}/catalog/products/${id}/variants`);
        const variants = data.data || [];
        results.push({
          productId: String(id),
          totalStock: variants.reduce((sum, v) => sum + (v.inventory_level || 0), 0),
          variants: variants.map((v) => ({
            id: String(v.id),
            title: v.option_values?.map((o) => o.label).join(' / ') || '',
            stock: v.inventory_level,
          })),
        });
      } catch (err) {
        logger.warn(`BigCommerce: failed to get inventory for product ${id}`, { error: err.message });
      }
    }
    return results;
  }

  async getAnalytics(dateRange = {}) {
    const minDate = dateRange.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({
      min_date_created: minDate,
      limit: '250',
      status_id: '10',  // 10 = Completed
    });
    try {
      const orders = await this._request(`${this.baseV2}/orders?${params}`);
      const list = Array.isArray(orders) ? orders : [];
      const revenue = list.reduce((sum, o) => sum + parseFloat(o.total_inc_tax || 0), 0);
      return {
        orders: list.length,
        revenue,
        currency: list[0]?.currency_code || 'USD',
      };
    } catch {
      return { orders: 0, revenue: 0, currency: 'USD' };
    }
  }

  _normalizeProduct(p) {
    return {
      id: String(p.id),
      title: p.name,
      description: p.description,
      status: p.is_visible ? 'active' : 'draft',
      price: parseFloat(p.price || 0),
      currency: 'USD',
      variants: (p.variants || []).map((v) => ({
        id: String(v.id),
        title: v.option_values?.map((o) => o.label).join(' / ') || '',
        price: parseFloat(v.sale_price || v.price || p.price || 0),
        stock: v.inventory_level,
      })),
      tags: typeof p.search_keywords === 'string'
        ? p.search_keywords.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      images: (p.images || []).map((i) => i.url_standard),
    };
  }
}

module.exports = BigCommerceAdapter;
