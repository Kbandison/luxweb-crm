import 'server-only';
import { supabaseServer } from './server';
import { supabaseAdmin } from './admin';

export type Session = {
  userId: string;
  email: string;
  role: 'admin' | 'client';
};

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
export async function getSession(): Promise<Session | null> {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile, error } = await supabaseAdmin()
      .from('users')
      .select('id, email, role')
      .eq('id', user.id)
      .single();

    if (error || !profile) return null;
    return {
      userId: profile.id as string,
      email: profile.email as string,
      role: profile.role as 'admin' | 'client',
    };
  } catch {
    return null;
  }
}
