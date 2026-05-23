'use strict';

const { createClient } = require('@supabase/supabase-js');
const logger = require('../../utils/logger');

let client = null;

function getSupabaseClient() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    logger.warn('Supabase credentials not set — metrics and decisions storage disabled.');
    return null;
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
  });

  logger.info('Supabase client initialized');
  return client;
}

/**
 * Safely executes a Supabase query, returning null on error or unavailability.
 */
async function supabaseQuery(queryFn) {
  const db = getSupabaseClient();
  if (!db) return null;
  try {
    const { data, error } = await queryFn(db);
    if (error) throw error;
    return data;
  } catch (err) {
    logger.error('Supabase query failed', { error: err });
    return null;
  }
}

module.exports = { getSupabaseClient, supabaseQuery };
