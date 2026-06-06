// One-off: move the admin login email from Gmail to the workspace address.
// The Supabase dashboard locks the email field for OAuth-linked accounts, so
// we do it via the admin (service-role) API, which also keeps the same user
// id — your admin role, audit trail, and everything you own stay intact.
//
// Run from the repo root:   node scripts/change-admin-email.mjs
// Reads .env.local for NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// Safe to delete this file afterward.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const OLD_EMAIL = 'kbandison@gmail.com';
const NEW_EMAIL = 'kbandison@luxwebstudio.dev';

// --- load env (.env.local first, then anything already in process.env) ---
function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!env[m[1]]) env[m[1]] = v;
    }
  } catch {
    /* no .env.local — rely on process.env */
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local).',
  );
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

// 1. Find the auth user by its current email.
const { data: list, error: listErr } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (listErr) {
  console.error('listUsers failed:', listErr.message);
  process.exit(1);
}
const user = list.users.find(
  (u) => (u.email ?? '').toLowerCase() === OLD_EMAIL.toLowerCase(),
);
if (!user) {
  console.error(`No auth user found with email ${OLD_EMAIL}.`);
  process.exit(1);
}
console.log(`Found user ${user.id} (${user.email}).`);

// 2. Change the auth login email (confirmed, so no verification round-trip).
const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
  email: NEW_EMAIL,
  email_confirm: true,
});
if (updErr) {
  console.error('updateUserById failed:', updErr.message);
  process.exit(1);
}
console.log(`Auth login email → ${NEW_EMAIL}`);

// 3. Sync the crm.users mirror (the trigger only fires on insert).
const crm = createClient(url, key, {
  auth: { persistSession: false },
  db: { schema: 'crm' },
});
const { error: crmErr } = await crm
  .from('users')
  .update({ email: NEW_EMAIL })
  .eq('id', user.id);
if (crmErr) {
  console.error('crm.users mirror update failed:', crmErr.message);
  process.exit(1);
}
console.log('crm.users mirror updated.');
console.log('Done. Sign in with a magic link to', NEW_EMAIL, 'to verify.');
