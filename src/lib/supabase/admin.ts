import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Service-role client. Server-only. Bypasses RLS (deny-all).
// Default schema: `crm` — assumes the crm schema is exposed in Supabase
// Data API settings (Phase 0 precondition).
let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'crm' as never }, // crm schema must be exposed
  });
  return _client;
}
