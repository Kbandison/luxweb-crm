import type { ProposalContent } from '@/lib/types/proposal';

type Milestone = ProposalContent['investment']['milestones'][number];

/**
 * What to invoice the client the moment they sign, or null when nothing is
 * due yet.
 *
 * The deposit is the first milestone carrying an amount. If the proposal
 * marks it collected — money the client handed over before the Agreement
 * existed — signing must raise nothing, or they get billed for it twice.
 *
 * Deliberately does NOT fall through to the next milestone when the first is
 * collected. Later phases bill when their work is approved, not at signature,
 * so sliding down the list would invoice the client early for work that
 * hasn't started.
 *
 * `milestoneIndex` is the deposit's position in the payment plan, so the
 * invoice can be linked to the project milestone seeded from it — that link
 * is how a payment knows which milestone it closes. Null when the whole
 * project is billed at once (no milestone carries an amount).
 */
export function depositForSigning(
  content: ProposalContent | null,
  fallbackTotalCents: number | null,
  fallbackLabel: string,
): { amountCents: number; label: string; milestoneIndex: number | null } | null {
  if (!content) {
    return fallbackTotalCents && fallbackTotalCents > 0
      ? { amountCents: fallbackTotalCents, label: 'Deposit', milestoneIndex: null }
      : null;
  }

  const milestones = content.investment.milestones ?? [];
  const index = milestones.findIndex((m) => m.amount_cents > 0);

  if (index !== -1) {
    const first = milestones[index];
    if (first.collected) return null;
    return {
      amountCents: first.amount_cents,
      label: first.label || 'Deposit',
      milestoneIndex: index,
    };
  }

  // No milestone carries an amount — bill the whole project at once.
  const total = content.investment.total_cents;
  return total > 0
    ? { amountCents: total, label: fallbackLabel, milestoneIndex: null }
    : null;
}

/**
 * Payments the client made before signing, to be recorded as paid invoices
 * so the money shows up in Finances and can be matched against the bank
 * deposit. Without a record the deposit sits unmatched in reconciliation.
 *
 * A collected milestone with no date falls back to the signing date —
 * sending requires one, so that's only legacy proposals.
 */
export function collectedPayments(
  content: ProposalContent | null,
  signedOn: string,
): {
  milestoneIndex: number;
  amountCents: number;
  label: string;
  paidOn: string;
  method: string;
}[] {
  const milestones = content?.investment.milestones ?? [];
  return milestones.flatMap((m, i) =>
    m.collected && m.amount_cents > 0
      ? [
          {
            milestoneIndex: i,
            amountCents: m.amount_cents,
            label: m.label || `Milestone ${i + 1}`,
            paidOn: m.collected_on || signedOn,
            method: m.collected_method?.trim() || 'Not recorded',
          },
        ]
      : [],
  );
}

/**
 * The starting status for each project milestone seeded from the proposal's
 * payment plan.
 *
 *   - collected  → 'done'. A payment already landed for it, which is exactly
 *                  what a Stripe payment would have done to the row.
 *   - first open → 'pending'. This is the work actually in front of us.
 *   - the rest   → 'inactive', unlocking one at a time as payments arrive.
 *
 * When every milestone is collected (a client who prepaid the whole project)
 * nothing is left 'pending'. The project stays in 'planning' rather than
 * being flipped complete — the money is in, but none of the work is done, and
 * auto-completing would fire the client's "leave us a review" email at the
 * moment they signed.
 */
export function seedStatusForMilestones(
  milestones: Milestone[],
): ('done' | 'pending' | 'inactive')[] {
  const firstOpen = milestones.findIndex((m) => !m.collected);
  return milestones.map((m, i) => {
    if (m.collected) return 'done';
    return i === firstOpen ? 'pending' : 'inactive';
  });
}

/**
 * The crm.milestones rows to insert for a freshly signed agreement — one per
 * proposal payment milestone, in order. sort_order mirrors the proposal
 * index, which is how depositForSigning / collectedPayments find the row
 * their invoice belongs to.
 *
 * source='proposal' enrolls them in the payment-driven flow; admin-added
 * milestones default to 'manual'.
 */
export function milestoneSeedRows(
  milestones: Milestone[],
  projectId: string,
  seededAt: string,
) {
  const statuses = seedStatusForMilestones(milestones);
  return milestones.map((m, i) => {
    const dollars = (m.amount_cents / 100).toFixed(
      m.amount_cents % 100 === 0 ? 0 : 2,
    );
    const descBits = [`$${dollars}`];
    if (m.due) descBits.push(m.due);
    if (m.collected) descBits.push('paid prior to signing');
    return {
      project_id: projectId,
      title: m.label || `Milestone ${i + 1}`,
      description: descBits.join(' · '),
      status: statuses[i],
      source: 'proposal',
      sort_order: i,
      is_client_visible: true,
      amount_cents: m.amount_cents,
      completed_at: m.collected ? seededAt : null,
    };
  });
}
