import type { ProposalContent } from '@/lib/types/proposal';
import { paidAtForDate } from '@/lib/invoices/paid-at';

type Milestone = ProposalContent['investment']['milestones'][number];

/**
 * What to invoice the client the moment they sign, or null when nothing is
 * due yet.
 *
 * On a phase plan the deposit is the milestone marked kind 'deposit'; on a
 * legacy plan it's the first milestone carrying an amount. If the proposal
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

  // Phase plan: only the deposit is due at signing. Every phase payment
  // waits for that phase's work to be approved — so no deposit means
  // nothing is billed until the first approval.
  if (content.investment.plan_version === 2) {
    const index = milestones.findIndex(
      (m) => m.kind === 'deposit' && m.amount_cents > 0,
    );
    if (index === -1 || milestones[index].collected) return null;
    return {
      amountCents: milestones[index].amount_cents,
      label: milestones[index].label || 'Deposit',
      milestoneIndex: index,
    };
  }

  // Legacy plan: the first milestone carrying an amount.
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

export type SigningPlan = {
  /**
   * What signing does about the deposit: raise an invoice ('pending'), or
   * nothing because it was already paid ('collected') or there isn't one
   * ('not_required').
   */
  depositState: 'pending' | 'collected' | 'not_required';
  /** Work starts at signature — the deposit is already in, or none is due. */
  startNow: boolean;
  milestones: {
    sort_order: number;
    title: string;
    description: string;
    status: 'done' | 'pending' | 'inactive';
    amount_cents: number;
    completed_at: string | null;
  }[];
  prepaid: {
    sort_order: number;
    description: string;
    amount_cents: number;
    paid_at: string;
    method: string;
  }[];
};

/**
 * Everything a client's signature writes, worked out up front so the
 * database can apply it in one transaction (crm.complete_signing). Pure —
 * the money and milestone rules are tested here, not in SQL.
 */
export function signingPlan(
  content: ProposalContent | null,
  opts: { title: string; totalCents: number | null; signedAt: string },
): SigningPlan {
  const milestones = content?.investment.milestones ?? [];
  const deposit = depositForSigning(
    content,
    opts.totalCents,
    `Project investment — ${opts.title}`,
  );
  const depositIndex =
    content?.investment.plan_version === 2
      ? milestones.findIndex((m) => m.kind === 'deposit' && m.amount_cents > 0)
      : milestones.findIndex((m) => m.amount_cents > 0);
  const depositState: SigningPlan['depositState'] = deposit
    ? 'pending'
    : depositIndex !== -1 && milestones[depositIndex].collected
      ? 'collected'
      : 'not_required';

  return {
    depositState,
    startNow: depositState !== 'pending',
    milestones: milestoneSeedRows(milestones, '', opts.signedAt).map((row) => ({
      sort_order: row.sort_order,
      title: row.title,
      description: row.description,
      status: row.status,
      amount_cents: row.amount_cents,
      completed_at: row.completed_at,
    })),
    prepaid: collectedPayments(content, opts.signedAt.slice(0, 10)).map((p) => ({
      sort_order: p.milestoneIndex,
      description: `${p.label} — ${opts.title}`,
      amount_cents: p.amountCents,
      paid_at: paidAtForDate(p.paidOn),
      method: p.method,
    })),
  };
}
