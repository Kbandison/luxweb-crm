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

type MilestoneRow = {
  id: string;
  title: string;
  status: string;
  sort_order: number;
  source: string | null;
  invoice_id: string | null;
  amount_cents: number | string | null;
};

/** Proposal-seeded rows (legacy rows predate the source column). */
function isProposalRow(r: MilestoneRow): boolean {
  return r.source === 'proposal' || r.source === null;
}

/**
 * Decide which milestone a paid invoice closes, and which one that unlocks.
 * Pure, so the money logic can be tested without a database.
 *
 *   1. The milestone linked to the invoice (milestones.invoice_id). Signing
 *      links the deposit; approving a milestone links its invoice.
 *   2. Legacy fallback for invoices raised before that link existed: an
 *      unlinked, still-open proposal milestone with the same amount whose
 *      title the invoice description starts with — the exact shape signing
 *      and approval have always used ("Deposit — Site build").
 *   3. Otherwise nothing. A change-order, hourly, or ad-hoc invoice is not a
 *      milestone payment and must not close one. (This used to close "the
 *      next milestone" on every paid invoice, so an unrelated $300 invoice
 *      could mark Build done.)
 *
 * Paying closes the milestone — payment is for work done. The next proposal
 * milestone in order unlocks if it's still locked.
 */
export function pickMilestoneForInvoice(
  rows: MilestoneRow[],
  invoice: { id: string; amountCents: number; description: string | null },
): { close: MilestoneRow | null; linkLegacy: boolean; unlock: MilestoneRow | null } {
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);

  let target = sorted.find((r) => r.invoice_id === invoice.id) ?? null;
  let linkLegacy = false;

  if (!target) {
    const description = invoice.description ?? '';
    target =
      sorted.find(
        (r) =>
          isProposalRow(r) &&
          !r.invoice_id &&
          r.status !== 'done' &&
          r.status !== 'blocked' &&
          Number(r.amount_cents) === invoice.amountCents &&
          description.startsWith(`${r.title} — `),
      ) ?? null;
    linkLegacy = target !== null;
  }

  // Already closed (a second delivery of the same payment) — nothing to do.
  if (!target || target.status === 'done') {
    return { close: null, linkLegacy: false, unlock: null };
  }

  return { close: target, linkLegacy, unlock: nextToUnlock(sorted, target) };
}

/**
 * The milestone that opens when `closing` completes: the next proposal
 * milestone in order, if it's still locked. Only the proposal chain unlocks
 * in sequence — a manual milestone closing doesn't open anything.
 */
function nextToUnlock(
  sorted: MilestoneRow[],
  closing: MilestoneRow,
): MilestoneRow | null {
  if (!isProposalRow(closing)) return null;
  const next = sorted.find(
    (r) => isProposalRow(r) && r.sort_order > closing.sort_order,
  );
  return next && next.status === 'inactive' ? next : null;
}

/**
 * Close the milestone a paid invoice was for, unlock the next one, and run
 * the project-completion check.
 *
 * Callers must only call this once per payment — claimInvoicePaid() is what
 * guarantees that. Best-effort: the payment itself is already recorded, so
 * errors are logged and swallowed.
 */
export async function closeMilestoneForInvoice(
  projectId: string,
  invoice: { id: string; amountCents: number; description: string | null },
): Promise<void> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('milestones')
      .select('id, title, status, sort_order, source, invoice_id, amount_cents')
      .eq('project_id', projectId);

    const { close, linkLegacy, unlock } = pickMilestoneForInvoice(
      (data ?? []) as MilestoneRow[],
      invoice,
    );

    if (close) {
      await sb
        .from('milestones')
        .update({
          status: 'done',
          completed_at: new Date().toISOString(),
          ...(linkLegacy ? { invoice_id: invoice.id } : {}),
        })
        .eq('id', close.id)
        .neq('status', 'done');
    }
    if (unlock) {
      await sb
        .from('milestones')
        .update({ status: 'pending' })
        .eq('id', unlock.id)
        .eq('status', 'inactive');
    }

    // Always check — covers the payment that closes out the project.
    await checkProjectCompletion(projectId);

    // Bust cached project pages so admin + client see the new state.
    revalidateProject(projectId);
  } catch (err) {
    console.warn('[close-milestone-for-invoice] failed:', err);
  }
}

/**
 * Complete a milestone that has nothing to pay — a $0 phase, or an unpriced
 * one — when the client approves it. Paying is what completes a billed
 * milestone; with no payment coming, approval has to, or the milestone sits
 * in progress forever and the phases after it never unlock.
 */
export async function completeUnbilledMilestone(
  projectId: string,
  milestoneId: string,
): Promise<void> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('milestones')
      .select('id, title, status, sort_order, source, invoice_id, amount_cents')
      .eq('project_id', projectId);
    const sorted = ((data ?? []) as MilestoneRow[]).sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    const target = sorted.find((r) => r.id === milestoneId);
    if (!target || target.status === 'done') return;

    await sb
      .from('milestones')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', target.id)
      .neq('status', 'done');
    const unlock = nextToUnlock(sorted, target);
    if (unlock) {
      await sb
        .from('milestones')
        .update({ status: 'pending' })
        .eq('id', unlock.id)
        .eq('status', 'inactive');
    }

    await checkProjectCompletion(projectId);
    revalidateProject(projectId);
  } catch (err) {
    console.warn('[complete-unbilled-milestone] failed:', err);
  }
}
