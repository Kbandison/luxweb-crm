import 'server-only';
import { cache } from 'react';
import { supabaseServer } from './server';
import { supabaseAdmin } from './admin';
import type { Role } from '@/lib/auth/permissions';

export type Session = {
  userId: string;
  email: string;
  role: Role;
};

/**
 * Per-request dedupe of the crm.users lookup. React's `cache` keys on
 * argument identity within an RSC render, so multiple guards calling
 * `getSession()` in the same request only hit Postgres once.
 *
 * `cache` is a no-op in route handlers / server actions outside an RSC
 * render, so we don't lose correctness — just lose the dedupe there.
 * The previous behaviour (one query per call) is preserved as a worst
 * case, which is acceptable.
 */
const fetchProfile = cache(async (userId: string) => {
  const { data, error } = await supabaseAdmin()
    .from('users')
    .select('id, email, role')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return data as { id: string; email: string; role: Role };
});

/**
 * Resolve the current session to { userId, email, role }.
 * Auth lookup goes through the SSR (anon) client (reads auth.users via
 * getUser()). Role lookup joins crm.users via the service_role client
 * because RLS is deny-all on the crm schema.
 *
 * Returns null on any failure (missing envs, no session, crm schema not
 * yet exposed). Callers use this to decide "authenticated or not" and
 * "which role dashboard to redirect to."
 */
export const getSession = cache(async (): Promise<Session | null> => {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const profile = await fetchProfile(user.id);
    if (!profile) return null;

    return {
      userId: profile.id,
      email: profile.email,
      role: profile.role,
    };
  } catch {
    return null;
  }
});
