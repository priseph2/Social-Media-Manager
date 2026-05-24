'use strict';

/**
 * Promotes a user to super_admin role in Supabase app_metadata.
 * Creates the user account if it does not exist yet.
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

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ALLOWED_EMAILS      = (process.env.SUPER_ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const targetEmail = (process.argv[2] || '').trim().toLowerCase();

// ── Synchronous guards (before any async work) ────────────────────────────────

function fail(msg) {
  console.error(msg);
  process.exitCode = 1;
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  fail('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

if (!targetEmail) {
  fail('Usage: node scripts/make-super-admin.js <email>');
  process.exit(1);
}

if (!ALLOWED_EMAILS.length) {
  fail('Error: SUPER_ADMIN_EMAILS is not set.\nExample: SUPER_ADMIN_EMAILS=you@company.com');
  process.exit(1);
}

if (!ALLOWED_EMAILS.includes(targetEmail)) {
  fail(`Error: "${targetEmail}" is not in the SUPER_ADMIN_EMAILS allowlist.\nAllowed: ${ALLOWED_EMAILS.join(', ')}`);
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Look up the user
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw new Error(`Failed to list users: ${listErr.message}`);

  let user = users.find((u) => u.email?.toLowerCase() === targetEmail);

  // User doesn't exist yet — create the account
  if (!user) {
    console.log(`"${targetEmail}" not found in Supabase Auth — creating account...`);

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: targetEmail,
      email_confirm: true,          // skip confirmation email
      app_metadata: { role: 'super_admin' },
    });

    if (createErr) throw new Error(`Failed to create user: ${createErr.message}`);

    user = created.user;
    console.log(`Account created. The user must set a password via "Forgot password" on first login.`);
    console.log(`Done — "${targetEmail}" is now super_admin.`);
    return;
  }

  // User already exists — check current role
  if (user.app_metadata?.role === 'super_admin') {
    console.log(`"${targetEmail}" is already a super_admin — nothing changed.`);
    return;
  }

  // Promote existing user
  const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role: 'super_admin' },
  });

  if (updateErr) throw new Error(`Failed to update user: ${updateErr.message}`);

  console.log(`Done — "${targetEmail}" is now super_admin.`);
}

run().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
