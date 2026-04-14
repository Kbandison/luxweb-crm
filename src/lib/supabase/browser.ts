'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

// Anon-key client for the browser. Respects RLS (deny-all) — used only
// for auth flows (signIn, OAuth, signOut). All data reads/writes happen
// through server routes with the service_role client.
export function supabaseBrowser(): SupabaseClient {
  if (_client) return _client;
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return _client;
}
