'use strict';

const { getSupabaseClient } = require('./database/supabase-client');
const logger = require('../utils/logger');

/**
 * Write a notification row for a tenant.
 * Non-blocking — swallows all errors so a notification failure never
 * breaks the calling code path.
 *
 * @param {string} tenantId
 * @param {{ type?: string, title: string, body?: string, link?: string }} opts
 */
async function notify(tenantId, { type = 'info', title, body = null, link = null }) {
  if (!tenantId || !title) return;
  try {
    const db = getSupabaseClient();
    if (!db) return;
    await db.from('notifications').insert({ tenant_id: tenantId, type, title, body, link });
  } catch (err) {
    logger.error('[notify] Failed to write notification', { tenantId, type, error: err.message });
  }
}

module.exports = { notify };
