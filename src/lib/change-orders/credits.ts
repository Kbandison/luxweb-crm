/**
 * Where a change order's credit goes: off the next payments that haven't
 * been billed yet, in the order they'd be billed. Never a refund — what
 * can't be applied (everything's already billed) is returned as unapplied
 * for the studio to settle by hand.
 *
 * Pure, so the money rule is tested here; crm.sign_change_order applies the
 * result and refuses if any target was billed or changed in the meantime.
 */

export type CreditTarget = {
  id: string;
  title: string;
  amount_cents: number | null;
  invoice_id: string | null;
  status: string;
  sort_order: number;
  source: string | null;
};

export type CreditLine = {
  milestone_id: string;
  from_cents: number;
  to_cents: number;
};

export function allocateCredit(
  milestones: CreditTarget[],
  creditCents: number,
): { lines: CreditLine[]; unappliedCents: number } {
  let remaining = Math.max(0, Math.round(creditCents));
  const lines: CreditLine[] = [];
  const unbilled = [...milestones]
    .filter(
      (m) =>
        (m.source === 'proposal' || m.source === 'change_order' || m.source === null) &&
        m.invoice_id === null &&
        m.status !== 'done' &&
        Number(m.amount_cents ?? 0) > 0,
    )
    .sort((a, b) => a.sort_order - b.sort_order);

  for (const m of unbilled) {
    if (remaining === 0) break;
    const from = Number(m.amount_cents);
    const take = Math.min(from, remaining);
    lines.push({ milestone_id: m.id, from_cents: from, to_cents: from - take });
    remaining -= take;
  }
  return { lines, unappliedCents: remaining };
}
