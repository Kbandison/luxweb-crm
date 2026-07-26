import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { portalHomeFor } from '@/lib/auth/permissions';

/**
 * Access helpers for the contractor staff portal. Contractors only ever see
 * projects they're assigned to (crm.project_assignments). Pages fail with
 * notFound() so we never leak the existence of unassigned projects; route
 * handlers use the boolean helpers to gate 404s themselves.
 */

/** The team_members.id linked to a contractor's auth user, or null. */
export async function contractorTeamMemberId(
  userId: string,
): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('team_members')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

/** True if the contractor (by auth user id) is assigned to the project. */
export async function isContractorAssigned(
  userId: string,
  projectId: string,
): Promise<boolean> {
  const teamMemberId = await contractorTeamMemberId(userId);
  if (!teamMemberId) return false;
  try {
    const { data } = await supabaseAdmin()
      .from('project_assignments')
      .select('id')
      .eq('project_id', projectId)
      .eq('team_member_id', teamMemberId)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

/** Resolve the project a message thread belongs to (for thread-scoped auth). */
export async function projectIdForThread(
  threadId: string,
): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('message_threads')
      .select('project_id')
      .eq('id', threadId)
      .maybeSingle();
    return (data as { project_id: string | null } | null)?.project_id ?? null;
  } catch {
    return null;
  }
}

export type StaffProjectAccess = { userId: string; teamMemberId: string };

/**
 * Page-side assignment gate. Redirects non-contractors to their own home and
 * 404s a contractor who isn't assigned to the project (or has no roster row).
 */
export async function requireAssignedProjectPage(
  projectId: string,
): Promise<StaffProjectAccess> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'contractor') redirect(portalHomeFor(session.role));

  const teamMemberId = await contractorTeamMemberId(session.userId);
  if (!teamMemberId) notFound();

  const { data: assignment } = await supabaseAdmin()
    .from('project_assignments')
    .select('id')
    .eq('project_id', projectId)
    .eq('team_member_id', teamMemberId)
    .maybeSingle();
  if (!assignment) notFound();

  return { userId: session.userId, teamMemberId };
}
