'use strict';

/**
 * Promotes a user to super_admin role in Supabase app_metadata.
 *
 * Usage:
 *   node scripts/make-super-admin.js you@example.com
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   SUPER_ADMIN_EMAILS  — comma-separated allowlist, e.g. "alice@co.com,bob@co.com"
 *
 * The allowlist is the safety gate: even if someone has the service key,
 * they can only promote addresses that are already in SUPER_ADMIN_EMAILS.
 * Control the list via your deployment secrets, not this file.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL       = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ALLOWED_EMAILS     = (process.env.SUPER_ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const targetEmail = (process.argv[2] || '').trim().toLowerCase();

// ── Guards ────────────────────────────────────────────────────────────────────

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

if (!targetEmail) {
  console.error('Usage: node scripts/make-super-admin.js <email>');
  process.exit(1);
}

if (!ALLOWED_EMAILS.length) {
  console.error('Error: SUPER_ADMIN_EMAILS is not set — add a comma-separated allowlist to .env');
  console.error('Example: SUPER_ADMIN_EMAILS=you@company.com,other@company.com');
  process.exit(1);
}

if (!ALLOWED_EMAILS.includes(targetEmail)) {
  console.error(`Error: "${targetEmail}" is not in SUPER_ADMIN_EMAILS allowlist.`);
  console.error(`Allowed: ${ALLOWED_EMAILS.join(', ')}`);
  process.exit(1);
}

// ── Promote ───────────────────────────────────────────────────────────────────

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) { console.error('Failed to list users:', listErr.message); process.exit(1); }

  const user = users.find((u) => u.email?.toLowerCase() === targetEmail);
  if (!user) {
    console.error(`Error: no Supabase user found with email "${targetEmail}"`);
    process.exit(1);
  }

  if (user.app_metadata?.role === 'super_admin') {
    console.log(`"${targetEmail}" is already a super_admin — nothing changed.`);
    process.exit(0);
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role: 'super_admin' },
  });

  if (updateErr) { console.error('Failed to update user:', updateErr.message); process.exit(1); }

  console.log(`Done — "${targetEmail}" is now super_admin.`);
}

run().catch((err) => { console.error(err); process.exit(1); });
