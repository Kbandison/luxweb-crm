/**
 * The overcharge guard's arithmetic. "Contracted" is the signed agreement's
 * total plus every signed change order (credits are negative). Automatic
 * invoices — deposits, phase payments, change-order work — must fit inside
 * it; a manual invoice that doesn't fit needs the studio to confirm (hourly
 * and out-of-scope work legitimately bills past the contract, § 1.2).
 */
export function billingCheck(opts: {
  contractedCents: number;
  billedCents: number;
  amountCents: number;
}): { ok: boolean; remainingCents: number; overByCents: number } {
  const remainingCents = opts.contractedCents - opts.billedCents;
  const overByCents = Math.max(0, opts.amountCents - remainingCents);
  return { ok: overByCents === 0, remainingCents, overByCents };
}
