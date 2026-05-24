'use strict';

const { getSupabaseClient } = require('../../services/database/supabase-client');
const logger = require('../../utils/logger');

async function requireSuperAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ error: 'Authentication service unavailable' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });

    if (user.app_metadata?.role !== 'super_admin') {
      logger.warn('Unauthorised admin access attempt', { userId: user.id, email: user.email });
      return res.status(403).json({ error: 'Forbidden — super_admin role required' });
    }

    req.adminUser = user;
    next();
  } catch (err) {
    logger.error('Admin auth failed', { error: err.message });
    res.status(401).json({ error: 'Token verification failed' });
  }
}

module.exports = { requireSuperAdmin };
