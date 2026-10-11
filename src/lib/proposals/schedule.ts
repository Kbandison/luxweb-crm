import type { ProposalContent } from '@/lib/types/proposal';

type Milestone = ProposalContent['investment']['milestones'][number];

/**
 * Round each value to a whole number so the results add up to the rounded
 * sum: everything rounds down, then the leftover units go to the largest
 * fractional parts.
 */
function roundKeepingSum(exact: number[]): number[] {
  const out = exact.map((x) => Math.floor(x));
  let leftover = Math.round(exact.reduce((s, x) => s + x, 0)) - out.reduce((s, x) => s + x, 0);
  const byFraction = exact
    .map((x, i) => ({ i, fraction: x - Math.floor(x) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const { i } of byFraction) {
    if (leftover <= 0) break;
    out[i] += 1;
    leftover -= 1;
  }
  return out;
}

/**
 * Each amount's whole-number share of `total`. Rounded together, so a
 * schedule that covers the total reads 100% — not 99% from three 33s.
 */
export function percentsOf(amounts: number[], total: number): number[] {
  if (total <= 0) return amounts.map(() => 0);
  return roundKeepingSum(amounts.map((a) => (a * 100) / total));
}

/**
 * The payment schedule under a new agreement total. Payments already
 * collected keep their amounts — that money is in hand. The rest keep their
 * share of what's left, worked out from their exact amounts (the
 * whole-number percent beside them is rounded, and rebuilding from it
 * rewrote amounts nobody typed). A schedule that covered the old total
 * covers the new one to the cent. A schedule with no amounts yet (a new
 * agreement's seeded 50/25/25) is filled from its percents instead. With
 * nothing to scale from — an old total of $0, or nothing left after
 * collected payments — typed amounts stay as typed.
 */
export function rescaleSchedule(
  milestones: Milestone[],
  oldTotalCents: number,
  newTotalCents: number,
): Milestone[] {
  const collected = milestones.reduce((s, m) => s + (m.collected ? m.amount_cents : 0), 0);
  const oldRest = oldTotalCents - collected;
  const newRest = newTotalCents - collected;
  const amounts = milestones.map((m) => m.amount_cents);

  const open = milestones.flatMap((m, i) => (m.collected ? [] : [i]));
  if (open.length > 0 && open.every((i) => milestones[i].amount_cents === 0)) {
    const filled = roundKeepingSum(
      open.map((i) => (newTotalCents * milestones[i].percent) / 100),
    );
    open.forEach((i, k) => {
      amounts[i] = filled[k];
    });
    // The percents are what was set; the amounts now follow them.
    return milestones.map((m, i) => ({ ...m, amount_cents: amounts[i] }));
  }
  if (open.length > 0 && oldRest > 0 && newRest >= 0) {
    const scaled = roundKeepingSum(
      open.map((i) => (milestones[i].amount_cents * newRest) / oldRest),
    );
    open.forEach((i, k) => {
      amounts[i] = scaled[k];
    });
  }

  const percents = percentsOf(amounts, newTotalCents);
  return milestones.map((m, i) => ({ ...m, amount_cents: amounts[i], percent: percents[i] }));
}
