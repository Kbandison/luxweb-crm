import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidateProject } from '@/lib/cache/revalidate-project';

/**
 * Advance the proposal-source milestone chain by one position when a
 * payment lands on the given project.
 *
 *   - Find the first non-done proposal milestone (lowest sort_order)
 *   - Mark it 'done' with completed_at = now()
 *   - If the next proposal milestone after it is 'inactive', flip to 'pending'
 *
 * Manual milestones (source='manual') are never touched. Idempotent: if
 * the chain has already advanced for a payment (e.g. webhook + reconcile
 * both fire) the second call finds a different "first non-done" row or
 * none at all and does nothing harmful.
 *
 * Best-effort. Returns void; errors are logged and swallowed since the
 * payment processing is the authoritative side-effect.
 */
export async function advanceProposalMilestoneChain(
  projectId: string,
): Promise<void> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('milestones')
      .select('id, status, sort_order')
      .eq('project_id', projectId)
      .eq('source', 'proposal')
      .order('sort_order', { ascending: true });

    type Row = { id: string; status: string; sort_order: number };
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return;

    // Find the first row that's NOT done. That's the one this payment
    // closes out. Skip blocked — admin needs to clear the block first.
    const nextIndex = rows.findIndex(
      (r) => r.status !== 'done' && r.status !== 'blocked',
    );
    if (nextIndex === -1) return; // all done already

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

    // If THIS payment closes out the very last open milestone on the
    // project (proposal AND manual rows considered together), flip the
    // project status to 'completed'. This is the "launch milestone is
    // paid → project done" trigger.
    const { data: openRows } = await sb
      .from('milestones')
      .select('id')
      .eq('project_id', projectId)
      .not('status', 'in', '("done","blocked")')
      .limit(1);
    if (!openRows || openRows.length === 0) {
      await sb
        .from('projects')
        .update({ status: 'completed', end_date: completedAt.slice(0, 10) })
        .eq('id', projectId)
        .neq('status', 'completed');
    }

    // Invalidate cached project pages so admin + client see the new state
    // immediately (router.refresh on the client only pulls fresh data when
    // the server cache has been busted).
    revalidateProject(projectId);
  } catch (err) {
    console.warn('[advance-milestone-chain] failed:', err);
  }
}
