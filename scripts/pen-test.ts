/**
 * LuxWeb CRM — RLS smoke test.
 *
 * Run: `npm run pen-test`
 *
 * Verifies the three-layer defense holds end-to-end:
 *   1. Anonymous clients can't read ANY crm.* table via the Data API
 *   2. Authenticated clients (anon JWT) can't either (RLS is deny-all)
 *
 * Pass criteria: every query returns an error or an empty result. A
 * non-empty result is a LEAK and fails the test.
 *
 * We don't test the service_role client here — that's expected to read
 * everything (the server routes use it; the guard layers live above).
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const anonClient = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: 'crm' as never },
});

const TABLES = [
  'users',
  'contacts',
  'deals',
  'projects',
  'milestones',
  'time_logs',
  'notes',
  'message_threads',
  'messages',
  'message_attachments',
  'proposals',
  'invoices',
  'files',
  'notifications',
  'audit_log',
];

type Result = {
  table: string;
  error: string | null;
  rows: number;
  verdict: 'PASS' | 'LEAK';
};

async function run() {
  console.log('LuxWeb CRM — RLS smoke test');
  console.log(`  Supabase: ${url}`);
  console.log('');

  const results: Result[] = [];

  for (const table of TABLES) {
    try {
      const { data, error } = await anonClient.from(table).select('*').limit(5);
      const rows = data?.length ?? 0;
      // PASS = either an error was returned OR zero rows came back.
      // LEAK = non-zero rows visible to the anonymous client.
      const verdict: Result['verdict'] = rows === 0 ? 'PASS' : 'LEAK';
      results.push({
        table,
        error: error?.message ?? null,
        rows,
        verdict,
      });
    } catch (err) {
      results.push({
        table,
        error: err instanceof Error ? err.message : String(err),
        rows: 0,
        verdict: 'PASS',
      });
    }
  }

  const maxTable = Math.max(...results.map((r) => r.table.length));
  for (const r of results) {
    const pad = r.table.padEnd(maxTable, ' ');
    const marker = r.verdict === 'PASS' ? '✓' : '✗ LEAK';
    const detail =
      r.verdict === 'LEAK'
        ? `returned ${r.rows} rows`
        : r.error
          ? `blocked (${truncate(r.error, 60)})`
          : `empty`;
    console.log(`  ${marker.padEnd(6)}  ${pad}   ${detail}`);
  }

  const leaks = results.filter((r) => r.verdict === 'LEAK');
  console.log('');
  if (leaks.length > 0) {
    console.error(`FAILED — ${leaks.length} table(s) visible to anonymous client:`);
    for (const l of leaks) console.error(`  · crm.${l.table} (${l.rows} rows)`);
    process.exit(1);
  }
  console.log(`PASSED — all ${results.length} crm.* tables are blocked at layer 3 (RLS).`);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
