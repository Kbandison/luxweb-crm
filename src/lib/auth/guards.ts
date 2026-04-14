import 'server-only';
import { getSession, type Session } from '@/lib/supabase/session';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function requireAdmin(): Promise<Session> {
  const s = await getSession();
  if (!s || s.role !== 'admin') {
    throw new Response('Forbidden', { status: 403 });
  }
  return s;
}

export async function requireClient(): Promise<Session> {
  const s = await getSession();
  if (!s || s.role !== 'client') {
    throw new Response('Forbidden', { status: 403 });
  }
  return s;
}

/**
 * Verify the current client user actually owns the requested project.
 * Returns 404 (not 403) on failure so we don't leak existence of other
 * clients' projects.
 */
export async function requireProjectAccess(projectId: string) {
  const session = await requireClient();
  const { data } = await supabaseAdmin()
    .from('projects')
    .select('id, contact_id, contacts!inner(user_id)')
    .eq('id', projectId)
    .single();

  // @ts-expect-error — join shape resolved at runtime
  if (!data || data.contacts.user_id !== session.userId) {
    throw new Response('Not found', { status: 404 });
  }
  return { session, project: data };
}
