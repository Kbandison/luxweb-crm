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
 */
export function depositForSigning(
  content: ProposalContent | null,
  fallbackTotalCents: number | null,
  fallbackLabel: string,
): { amountCents: number; label: string } | null {
  if (!content) {
    return fallbackTotalCents && fallbackTotalCents > 0
      ? { amountCents: fallbackTotalCents, label: 'Deposit' }
      : null;
  }

  const milestones = content.investment.milestones ?? [];
  const first = milestones.find((m) => m.amount_cents > 0);

  if (first) {
    if (first.collected) return null;
    return { amountCents: first.amount_cents, label: first.label || 'Deposit' };
  }

  // No milestone carries an amount — bill the whole project at once.
  const total = content.investment.total_cents;
  return total > 0 ? { amountCents: total, label: fallbackLabel } : null;
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
