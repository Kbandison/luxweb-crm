import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { notify, getContactUserId } from '@/lib/notifications';

/**
 * Flip the project to 'completed' if no open milestones remain.
 * Considers proposal AND manual milestones (and legacy rows with no
 * source set). Idempotent — the `neq('status', 'completed')` guards
 * against double-flips.
 *
 * Call this any time a milestone transitions to 'done' (payment-driven
 * or manual admin override) so the user always sees a fresh project
 * state without needing to remember to update it themselves.
 */
export async function checkProjectCompletion(
  projectId: string,
): Promise<boolean> {
  try {
    const sb = supabaseAdmin();
    const { data: openRows } = await sb
      .from('milestones')
      .select('id')
      .eq('project_id', projectId)
      .not('status', 'in', '("done","blocked")')
      .limit(1);
    if (openRows && openRows.length > 0) return false;

    // Only flip if not already completed — guards against double-firing
    // the project_completed notification when both webhook + reconcile
    // close out the final milestone.
    //
    // Stamp end_date in America/New_York (project owner's locale) rather
    // than the server's UTC slice — otherwise a project that completes at
    // 8 PM ET on Mar 5 gets stamped Mar 6 in the UI (because UTC has
    // already rolled). en-CA gives YYYY-MM-DD output natively.
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const { data: updated } = await sb
      .from('projects')
      .update({ status: 'completed', end_date: today })
      .eq('id', projectId)
      .neq('status', 'completed')
      .select('id, name, contact_id');
    type ProjRow = { id: string; name: string; contact_id: string };
    const justCompleted = (updated as ProjRow[] | null)?.[0] ?? null;
    if (!justCompleted) {
      // Already 'completed' on a prior call — nothing to notify about.
      return true;
    }

    // Prompt the client to leave a review. The notification deep-links
    // into the project overview where the review card lives.
    try {
      const clientUserId = await getContactUserId(justCompleted.contact_id);
      if (clientUserId) {
        await notify({
          type: 'project_completed',
          userId: clientUserId,
          projectId: justCompleted.id,
          projectName: justCompleted.name,
          projectPath: `/portal/project/${justCompleted.id}`,
        });
      }
    } catch (err) {
      console.warn('[check-project-completion] notify failed:', err);
    }
    return true;
  } catch (err) {
    console.warn('[check-project-completion] failed:', err);
    return false;
  }
}

/**
 * Advance the milestone chain by one position when a payment lands on
 * the given project.
 *
 *   - Find the first non-done milestone in the project (lowest sort_order),
 *     preferring proposal-source rows. Legacy rows with source=NULL count
 *     as proposal too — they were seeded before the source column existed.
 *   - Mark it 'done' with completed_at = now()
 *   - If the next milestone after it is 'inactive', flip to 'pending'
 *   - Then run the project-completion check.
 *
 * Idempotent: if the chain has already advanced for a payment (e.g.
 * webhook + reconcile both fire) the second call finds a different
 * "first non-done" row or none at all and does nothing harmful.
 *
 * Best-effort. Returns void; errors are logged and swallowed since the
 * payment processing is the authoritative side-effect.
 */
export async function advanceProposalMilestoneChain(
  projectId: string,
): Promise<void> {
  try {
    const sb = supabaseAdmin();
    // Tolerate legacy data: include rows where source is NULL alongside
    // explicit 'proposal' rows. Skipping the source filter entirely could
    // sweep in manual milestones, but `source.is.null` is a backfill-safe
    // workaround for older test data.
    const { data } = await sb
      .from('milestones')
      .select('id, status, sort_order, source')
      .eq('project_id', projectId)
      .or('source.eq.proposal,source.is.null')
      .order('sort_order', { ascending: true });

    type Row = {
      id: string;
      status: string;
      sort_order: number;
      source: string | null;
    };
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) {
      // No proposal-y rows at all. Still run completion check — a
      // project with only manual milestones could be fully done.
      await checkProjectCompletion(projectId);
      revalidateProject(projectId);
      return;
    }

    // Find the first row that's NOT done. That's the one this payment
    // closes out. Skip blocked — admin needs to clear the block first.
    const nextIndex = rows.findIndex(
      (r) => r.status !== 'done' && r.status !== 'blocked',
    );

    if (nextIndex !== -1) {
      const closing = rows[nextIndex];
      const completedAt = new Date().toISOString();
      await sb
        .from('milestones')
        .update({ status: 'done', completed_at: completedAt })
        .eq('id', closing.id);

      // Unlock the next inactive row if present.
      const next = rows[nextIndex + 1];
      if (next && next.status === 'inactive') {
        await sb
          .from('milestones')
          .update({ status: 'pending' })
          .eq('id', next.id);
      }
    }

    // Always check after the advance — covers the case where the chain
    // is the last thing closing out the project.
    await checkProjectCompletion(projectId);

    // Invalidate cached project pages so admin + client see the new state
    // immediately (router.refresh on the client only pulls fresh data when
    // the server cache has been busted).
    revalidateProject(projectId);
  } catch (err) {
    console.warn('[advance-milestone-chain] failed:', err);
  }
}
