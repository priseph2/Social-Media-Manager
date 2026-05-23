'use strict';

class EcommerceAdapter {
  constructor(credentials) {
    this.credentials = credentials;
  }

  // Must be implemented by subclasses
  async getProducts(opts = {}) { throw new Error('Not implemented'); }
  async getProduct(id) { throw new Error('Not implemented'); }
  async updateProduct(id, data) { throw new Error('Not implemented'); }
  async getOrders(opts = {}) { throw new Error('Not implemented'); }
  async getInventoryLevels(productIds) { throw new Error('Not implemented'); }
  async getAnalytics(dateRange) { throw new Error('Not implemented'); }

  // Normalize a product to our common shape
  _normalizeProduct(raw) {
    throw new Error('Not implemented');
  }
}

module.exports = EcommerceAdapter;
