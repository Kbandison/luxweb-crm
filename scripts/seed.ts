/**
 * LuxWeb CRM — first-run seed.
 * Idempotent: safe to re-run. Prints a summary of what changed.
 *
 * Run with: `npm run seed`
 *
 * Env (read from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   STRIPE_SECRET_KEY              (optional — skips Care Plan if absent)
 *   SEED_ADMIN_EMAIL               (optional — defaults to kevin@luxwebstudio.dev)
 *   SEED_ADMIN_NAME                (optional — defaults to Kevin Bandison)
 *   SEED_ADMIN_PASSWORD            (optional — if omitted, Kevin uses magic link / Google OAuth)
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

config({ path: '.env.local' });

const KEVIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'kevin@luxwebstudio.dev';
const KEVIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Kevin Bandison';
const KEVIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

const BUCKET = 'project-files';
const BUCKET_LIMIT = 50 * 1024 * 1024; // 50MB

const CARE_PLAN_SKU = 'care_plan';
const CARE_PLAN_NAME = 'Care Plan';
const CARE_PLAN_AMOUNT_CENTS = 17500; // $175/mo

// --- clients ---------------------------------------------------------------
const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: 'crm' as never },
});

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// --- main ------------------------------------------------------------------
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function main() {
  log('LuxWeb CRM — seed');
  log(`  Admin: ${KEVIN_EMAIL}`);
  log(`  Supabase: ${url}`);
  log('');

  const userId = await seedAdmin();
  await seedStorageBucket();
  const carePlanPriceId = await seedCarePlan();

  log('');
  log('Summary');
  log(`  admin.auth.users     → ${userId}`);
  log(`  admin.crm.users.role → admin`);
  log(`  storage bucket       → ${BUCKET}`);
  log(
    `  Stripe Care Plan     → ${
      carePlanPriceId ?? '(skipped — no STRIPE_SECRET_KEY)'
    }`,
  );

  if (carePlanPriceId) {
    log('');
    log('Paste into .env.local and your Vercel project env:');
    log(`  STRIPE_CARE_PLAN_PRICE_ID=${carePlanPriceId}`);
  }

  log('');
  log('Done.');
}

// --- admin user ------------------------------------------------------------
async function seedAdmin(): Promise<string> {
  // 1. Find or create the auth.users row.
  //    listUsers paginates — look up to 1000 users; if your project has
  //    more and the admin isn't in the first page, raise perPage.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw listErr;

  let userId = list.users.find((u) => u.email === KEVIN_EMAIL)?.id;

  if (!userId) {
    log(`  ⇢ creating auth user for ${KEVIN_EMAIL}`);
    const { data: created, error } = await admin.auth.admin.createUser({
      email: KEVIN_EMAIL,
      email_confirm: true,
      password: KEVIN_PASSWORD,
      user_metadata: { full_name: KEVIN_NAME },
    });
    if (error) throw error;
    userId = created.user!.id;
  } else {
    log(`  ✓ auth user exists (${userId})`);
  }

  // 2. The handle_new_user trigger created crm.users with role='client'.
  //    Upgrade to admin and make sure full_name is set.
  const { error: upErr } = await admin
    .from('users')
    .upsert(
      {
        id: userId,
        email: KEVIN_EMAIL,
        full_name: KEVIN_NAME,
        role: 'admin',
      },
      { onConflict: 'id' },
    );
  if (upErr) throw upErr;
  log(`  ✓ crm.users.role = admin`);

  // One-admin invariant — any previous admin with a different email is
  // demoted to client. Doesn't touch auth.users; remove that manually
  // in the Supabase dashboard if you want the account gone entirely.
  const { data: demoted, error: demoteErr } = await admin
    .from('users')
    .update({ role: 'client' })
    .eq('role', 'admin')
    .neq('email', KEVIN_EMAIL)
    .select('email');
  if (demoteErr) throw demoteErr;
  if (demoted && demoted.length > 0) {
    log(`  ⇢ demoted ${demoted.length} prior admin(s): ${demoted.map((d) => d.email).join(', ')}`);
  }

  return userId;
}

// --- storage ---------------------------------------------------------------
async function seedStorageBucket() {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) throw error;

  const existing = buckets?.find((b) => b.name === BUCKET);
  if (existing) {
    log(`  ✓ storage bucket "${BUCKET}" exists (private=${!existing.public})`);
    return;
  }

  log(`  ⇢ creating storage bucket "${BUCKET}"`);
  const { error: createErr } = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: BUCKET_LIMIT,
  });
  if (createErr) throw createErr;
}

// --- Stripe Care Plan ------------------------------------------------------
async function seedCarePlan(): Promise<string | null> {
  if (!stripe) return null;

  // Find existing product by metadata (re-runs don't duplicate).
  const products = await stripe.products.search({
    query: `metadata['luxweb_sku']:'${CARE_PLAN_SKU}' AND active:'true'`,
  });
  let product = products.data[0];

  if (!product) {
    log(`  ⇢ creating Stripe product "${CARE_PLAN_NAME}"`);
    product = await stripe.products.create({
      name: CARE_PLAN_NAME,
      metadata: { luxweb_sku: CARE_PLAN_SKU },
    });
  } else {
    log(`  ✓ Stripe product "${CARE_PLAN_NAME}" exists (${product.id})`);
  }

  // Find matching $175/mo price; else create.
  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 10,
  });
  let price = prices.data.find(
    (p) =>
      p.unit_amount === CARE_PLAN_AMOUNT_CENTS &&
      p.currency === 'usd' &&
      p.recurring?.interval === 'month',
  );

  if (!price) {
    log(`  ⇢ creating Stripe price $175/mo`);
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: CARE_PLAN_AMOUNT_CENTS,
      currency: 'usd',
      recurring: { interval: 'month' },
    });
  } else {
    log(`  ✓ Stripe price $175/mo exists (${price.id})`);
  }

  return price.id;
}

// --- utils -----------------------------------------------------------------
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

function log(msg: string) {
  console.log(msg);
}
