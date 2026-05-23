'use strict';

/**
 * Validates that required env vars are present and returns typed config.
 * Missing optional vars log a warning; missing required vars throw on startup.
 */
function getDbConfig() {
  const required = ['ANTHROPIC_API_KEY'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);

  const optional = ['REDIS_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'MONGODB_URI'];
  const missingOptional = optional.filter((k) => !process.env[k]);
  if (missingOptional.length) {
    // logged lazily when logger is available
    process.env._MISSING_OPTIONAL_DB = missingOptional.join(',');
  }

  return {
    redis: {
      url: process.env.REDIS_URL || null,
      tls: process.env.REDIS_URL?.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
    },
    supabase: {
      url: process.env.SUPABASE_URL || null,
      key: process.env.SUPABASE_SERVICE_KEY || null,
    },
    mongodb: {
      uri: process.env.MONGODB_URI || null,
    },
  };
}

module.exports = { getDbConfig };
