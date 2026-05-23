'use strict';

const EcommerceAdapter = require('../base-adapter');

class WooCommerceAdapter extends EcommerceAdapter {
  constructor(credentials) {
    super(credentials);
    // credentials: { siteUrl, consumerKey, consumerSecret }
  }

  async getProducts(opts = {}) { return []; }
  async getProduct(id) { return null; }
  async updateProduct(id, data) { return null; }
  async getOrders(opts = {}) { return []; }
  async getInventoryLevels(productIds) { return []; }
  async getAnalytics(dateRange) { return { orders: 0, revenue: 0 }; }
  _normalizeProduct(p) { return p; }
}

module.exports = WooCommerceAdapter;
