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

  async getProducts({ limit = 50, collectionId } = {}) {
    if (!this.available) return [];
    // TODO: GET /products.json
    return [];
  }

  async updateProduct(productId, updates) {
    if (!this.available) return null;
    // TODO: PUT /products/{productId}.json
    return null;
  }

  async getOrders({ status = 'open', limit = 50 } = {}) {
    if (!this.available) return [];
    // TODO: GET /orders.json
    return [];
  }

  async getInventoryLevels(inventoryItemIds) {
    if (!this.available) return [];
    // TODO: GET /inventory_levels.json
    return [];
  }
}

module.exports = new ShopifyAPI();
