'use strict';

const logger = require('../../utils/logger');

class ShopifyAPI {
  constructor() {
    this.storeUrl = process.env.SHOPIFY_STORE_URL;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    this.available = Boolean(this.storeUrl && this.accessToken);
    if (!this.available) logger.warn('Shopify not configured — e-commerce features disabled.');
  }

  get baseUrl() {
    return `https://${this.storeUrl}/admin/api/2024-07`;
  }

  get _headers() {
    return {
      'X-Shopify-Access-Token': this.accessToken,
      'Content-Type': 'application/json',
    };
  }

  async _request(path, method = 'GET', body = null, queryParams = null) {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));

    let url = `${this.baseUrl}${path}`;
    if (queryParams) url += '?' + new URLSearchParams(queryParams).toString();

    const opts = { method, headers: this._headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify ${method} ${path} → ${res.status}: ${text}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  /**
   * Fetch products from the store.
   *
   * @param {object} [opts]
   * @param {number} [opts.limit=50]        - max results (Shopify cap: 250)
   * @param {string} [opts.collectionId]    - filter by collection
   * @param {string} [opts.status]          - active | archived | draft
   * @returns {Array} normalised product objects
   */
  async getProducts({ limit = 50, collectionId, status } = {}) {
    if (!this.available) return [];
    try {
      const params = { limit: String(Math.min(limit, 250)) };
      if (collectionId) params.collection_id = String(collectionId);
      if (status) params.status = status;

      const data = await this._request('/products.json', 'GET', null, params);
      return (data?.products ?? []).map((p) => ({
        id: String(p.id),
        title: p.title,
        vendor: p.vendor,
        productType: p.product_type,
        status: p.status,
        handle: p.handle,
        tags: p.tags ? p.tags.split(', ') : [],
        price: parseFloat(p.variants?.[0]?.price ?? 0),
        compareAtPrice: parseFloat(p.variants?.[0]?.compare_at_price ?? 0) || null,
        inventory: p.variants?.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
        imageUrl: p.image?.src ?? null,
        variants: (p.variants ?? []).map((v) => ({
          id: String(v.id),
          title: v.title,
          price: parseFloat(v.price),
          inventory: v.inventory_quantity,
          inventoryItemId: String(v.inventory_item_id),
          sku: v.sku,
        })),
      }));
    } catch (err) {
      logger.error('[Shopify] getProducts failed', { error: err.message });
      return [];
    }
  }

  /**
   * Update a product's fields (title, description, tags, price, status).
   *
   * @param {string|number} productId
   * @param {object} updates - fields to update on the product object
   * @returns {object|null} updated product or null on failure
   */
  async updateProduct(productId, updates) {
    if (!this.available) return null;
    try {
      const safeId = encodeURIComponent(String(productId).replace(/\D/g, ''));
      const data = await this._request(`/products/${safeId}.json`, 'PUT', { product: updates });
      logger.info('[Shopify] Product updated', { productId });
      return data?.product ?? null;
    } catch (err) {
      logger.error('[Shopify] updateProduct failed', { productId, error: err.message });
      return null;
    }
  }

  /**
   * Fetch orders.
   *
   * @param {object} [opts]
   * @param {string} [opts.status='open'] - open | closed | cancelled | any
   * @param {number} [opts.limit=50]
   * @param {string} [opts.since]         - ISO date for created_at_min
   * @returns {Array} normalised order objects
   */
  async getOrders({ status = 'open', limit = 50, since } = {}) {
    if (!this.available) return [];
    try {
      const params = { status, limit: String(Math.min(limit, 250)) };
      if (since) params.created_at_min = new Date(since).toISOString();

      const data = await this._request('/orders.json', 'GET', null, params);
      return (data?.orders ?? []).map((o) => ({
        id: String(o.id),
        name: o.name,
        email: o.email,
        phone: o.phone,
        financialStatus: o.financial_status,
        fulfillmentStatus: o.fulfillment_status,
        totalPrice: parseFloat(o.total_price),
        currency: o.currency,
        createdAt: o.created_at,
        lineItems: (o.line_items ?? []).map((li) => ({
          productId: String(li.product_id),
          variantId: String(li.variant_id),
          title: li.title,
          quantity: li.quantity,
          price: parseFloat(li.price),
        })),
      }));
    } catch (err) {
      logger.error('[Shopify] getOrders failed', { error: err.message });
      return [];
    }
  }

  /**
   * Fetch inventory levels for a list of inventory item IDs.
   *
   * Shopify caps at 50 IDs per request; this method batches automatically.
   *
   * @param {string[]|number[]} inventoryItemIds
   * @returns {Array<{ inventoryItemId, locationId, available }>}
   */
  async getInventoryLevels(inventoryItemIds = []) {
    if (!this.available) return [];
    if (!inventoryItemIds.length) return [];

    try {
      const BATCH = 50;
      const results = [];

      for (let i = 0; i < inventoryItemIds.length; i += BATCH) {
        const ids = inventoryItemIds.slice(i, i + BATCH).map(String).join(',');
        const data = await this._request('/inventory_levels.json', 'GET', null, {
          inventory_item_ids: ids,
          limit: '250',
        });
        (data?.inventory_levels ?? []).forEach((lvl) => {
          results.push({
            inventoryItemId: String(lvl.inventory_item_id),
            locationId: String(lvl.location_id),
            available: lvl.available,
          });
        });
      }

      return results;
    } catch (err) {
      logger.error('[Shopify] getInventoryLevels failed', { error: err.message });
      return [];
    }
  }
}

module.exports = new ShopifyAPI();
