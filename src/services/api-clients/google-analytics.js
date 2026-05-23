'use strict';

const logger = require('../../utils/logger');

class GoogleAnalyticsAPI {
  constructor() {
    this.propertyId = process.env.GA4_PROPERTY_ID;
    this.available = Boolean(this.propertyId);
    if (!this.available) logger.warn('GA4 not configured — website analytics disabled.');
  }

  async getActiveUsers({ startDate, endDate }) {
    if (!this.available) return null;
    // TODO: POST https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport
    // Requires google-auth-library + GA4 Data API
    return null;
  }

  async getTopPages({ startDate, endDate, limit = 10 }) {
    if (!this.available) return [];
    return [];
  }

  async getConversionMetrics({ startDate, endDate }) {
    if (!this.available) return null;
    return null;
  }
}

module.exports = new GoogleAnalyticsAPI();
