/**
 * Seed one sample contractor so /admin/team is populated for a click-through.
 * Idempotent by name — re-running won't create duplicates. No email is sent.
 * Remove the record anytime from the Team UI.
 *
 * Run: `npx tsx scripts/seed-team-member.ts`
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: 'crm' as never },
});

const SAMPLE = {
  full_name: 'Jordan Blake',
  title: 'Frontend Developer',
  role: 'contractor' as const,
  employment_type: 'contractor' as const,
  status: 'active' as const,
  rate_cents: 9500, // $95/hr
  rate_type: 'hourly' as const,
  email: null as string | null, // null so the invite button stays disabled
  notes: 'Sample record — remove anytime from the Team page.',
};

async function main() {
  const { data: existing } = await sb
    .from('team_members')
    .select('id')
    .eq('full_name', SAMPLE.full_name)
    .maybeSingle();

  if (existing) {
    console.log(`Already present: ${SAMPLE.full_name} (${(existing as { id: string }).id})`);
    return;
  }

  const { data, error } = await sb
    .from('team_members')
    .insert(SAMPLE)
    .select('id')
    .single();

  if (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }
  console.log(`Seeded ${SAMPLE.full_name} (${(data as { id: string }).id}) — contractor, $95/hr.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
