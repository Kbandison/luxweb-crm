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

  // Supabase typegen infers !inner joins as arrays even when they're 1:1.
  // Normalize the runtime shape so we can compare user_id directly.
  type Shape = {
    contacts:
      | { user_id: string | null }
      | { user_id: string | null }[];
  };
  const row = data as unknown as Shape | null;
  const contact = row
    ? Array.isArray(row.contacts)
      ? row.contacts[0]
      : row.contacts
    : null;
  if (!data || !contact || contact.user_id !== session.userId) {
    throw new Response('Not found', { status: 404 });
  }
  return { session, project: data };
}
