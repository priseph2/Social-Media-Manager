'use strict';

const { getCredentials } = require('../credential-store');
const ShopifyAdapter = require('./adapters/shopify');
const WooCommerceAdapter = require('./adapters/woocommerce');
const BigCommerceAdapter = require('./adapters/bigcommerce');
const WixAdapter = require('./adapters/wix');

const ADAPTERS = {
  shopify: ShopifyAdapter,
  woocommerce: WooCommerceAdapter,
  bigcommerce: BigCommerceAdapter,
  wix: WixAdapter,
};

async function getEcommerceAdapter(tenantId) {
  const creds = await getCredentials(tenantId, 'ecommerce');
  if (!creds) return null;

  const platformType = creds._platformType;
  const AdapterClass = ADAPTERS[platformType];
  if (!AdapterClass) throw new Error(`Unknown ecommerce platform: ${platformType}`);

  const { _platformType, ...cleanCreds } = creds;
  return new AdapterClass(cleanCreds);
}

module.exports = { getEcommerceAdapter };
