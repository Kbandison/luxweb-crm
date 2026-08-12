/**
 * Matching bank deposits to the invoices they paid.
 *
 * Pure functions — no I/O — so the money logic can be reasoned about and
 * tested on its own.
 *
 * The problem: Stripe settles in batches, net of its cut. Three $400 invoices
 * paid Tuesday arrive as one $1,165.20 deposit on Thursday. So a match is a
 * *subset* of invoices whose gross total, minus a plausible processor fee,
 * equals the deposit.
 *
 * We don't hardcode Stripe's rate. We compute the implied fee (gross −
 * deposit) and accept the subset when that lands in a believable range. That
 * survives rate changes, international cards, and non-Stripe payments, where
 * assuming 2.9% + 30¢ would quietly mis-match.
 */

export type Candidate = {
  invoiceId: string;
  amountCents: number;
  paidAt: string | null;
  label: string;
};

export type MatchSuggestion = {
  invoiceIds: string[];
  /** Sum of the matched invoices, before fees. */
  grossCents: number;
  /** gross − deposit. Zero for a direct payment, positive when a processor took a cut. */
  impliedFeeCents: number;
  /** 'exact' when the deposit equals the gross to the cent. */
  kind: 'exact' | 'net-of-fees';
  confidence: 'high' | 'medium';
};

/**
 * Widest plausible processor cut for a given gross and invoice count.
 * 4.5% covers Stripe's 2.9% plus international/currency surcharges; $1 per
 * invoice covers the fixed per-transaction component with headroom.
 */
function maxPlausibleFee(grossCents: number, count: number): number {
  return Math.round(grossCents * 0.045) + 100 * count;
}

/** Cap on candidates considered, so the subset search stays bounded. */
const MAX_CANDIDATES = 12;
/** Never propose a batch larger than this. */
const MAX_SUBSET_SIZE = 6;

/**
 * Suggested ways this deposit could be accounted for, best first.
 *
 * Ranked by: exact matches over fee-adjusted ones, then fewer invoices, then
 * smaller implied fee. Ties are common when several invoices share an amount,
 * which is exactly why this suggests rather than decides — a human confirms.
 */
export function suggestMatches(
  depositCents: number,
  candidates: Candidate[],
  limit = 5,
): MatchSuggestion[] {
  if (depositCents <= 0 || candidates.length === 0) return [];

  // Largest first: a deposit is usually explained by its biggest invoices, so
  // the useful subsets surface before the cap bites.
  const pool = [...candidates]
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, MAX_CANDIDATES);

  const out: MatchSuggestion[] = [];
  const n = pool.length;

  // Bounded subset enumeration — at most 2^12 = 4096 iterations.
  for (let mask = 1; mask < 1 << n; mask++) {
    const picked: Candidate[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) picked.push(pool[i]);
    }
    if (picked.length > MAX_SUBSET_SIZE) continue;

    const gross = picked.reduce((s, c) => s + c.amountCents, 0);
    // A deposit can never exceed the gross it came from.
    if (gross < depositCents) continue;

    const impliedFee = gross - depositCents;
    if (impliedFee > maxPlausibleFee(gross, picked.length)) continue;

    out.push({
      invoiceIds: picked.map((c) => c.invoiceId),
      grossCents: gross,
      impliedFeeCents: impliedFee,
      kind: impliedFee === 0 ? 'exact' : 'net-of-fees',
      // One invoice matching to the cent is near-certain; a five-invoice
      // subset inferred from a fee range is a reasonable guess, no more.
      confidence:
        impliedFee === 0 || (picked.length === 1 && impliedFee <= maxPlausibleFee(gross, 1))
          ? 'high'
          : 'medium',
    });
  }

  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'exact' ? -1 : 1;
    if (a.invoiceIds.length !== b.invoiceIds.length) {
      return a.invoiceIds.length - b.invoiceIds.length;
    }
    return a.impliedFeeCents - b.impliedFeeCents;
  });

  return out.slice(0, limit);
}
