/**
 * Studio expense categories for the P&L.
 *
 * Client-safe (no server imports) so the page and the category picker share
 * one vocabulary.
 */

export const EXPENSE_CATEGORIES = [
  'Software',
  'Contractors',
  'Commissions',
  'Advertising',
  'Professional services',
  'Bank fees',
  'Equipment',
  'Travel & meals',
  'Taxes',
  'Owner draw',
  'Other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Transaction kinds that move money between the studio's own Mercury accounts.
 *
 * These are NOT expenses and must never reach the P&L. The studio runs an
 * envelope setup — Taxes, Commission Payouts, Operating Expenses, Personal
 * Payouts are all Mercury accounts — so earmarking cash by moving it between
 * them would otherwise read as spending it, and the same dollar would be
 * counted as an expense twice: once moving into the envelope, once leaving it.
 *
 * Money only counts when it actually leaves Mercury.
 */
const INTERNAL_KINDS = new Set(['internalTransfer', 'treasuryTransfer']);

export function isInternalTransfer(kind: string | null | undefined): boolean {
  return !!kind && INTERNAL_KINDS.has(kind);
}

/** Bank-charged fees, which arrive as their own transaction kinds. */
const FEE_KINDS = new Set([
  'wireFee',
  'cardInternationalTransactionFee',
  'personalBankingSubscriptionFee',
  'billingEngineSubscriptionFee',
]);

/**
 * Mercury's merchant categories → our vocabulary. Mercury's enum is long and
 * retail-shaped; only the ones a web studio actually hits are mapped, and
 * anything unmapped falls through to review rather than a wrong bucket.
 */
const MERCURY_CATEGORY_MAP: Record<string, ExpenseCategory> = {
  Advertising: 'Advertising',
  SoftwareAndSubscriptions: 'Software',
  Software: 'Software',
  ProfessionalServices: 'Professional services',
  LegalAndProfessional: 'Professional services',
  Consulting: 'Professional services',
  BankFees: 'Bank fees',
  Taxes: 'Taxes',
  Travel: 'Travel & meals',
  Airlines: 'Travel & meals',
  Lodging: 'Travel & meals',
  RestaurantsAndDining: 'Travel & meals',
  AlcoholAndBars: 'Travel & meals',
  ComputerHardware: 'Equipment',
  OfficeSupplies: 'Equipment',
  Payroll: 'Contractors',
  Contractors: 'Contractors',
};

/**
 * Best guess at a category, in priority order:
 *   1. what someone set in the CRM — always wins
 *   2. the transaction kind, for bank fees
 *   3. Mercury's own merchant category
 * Returns null when we genuinely don't know, so the UI can ask rather than
 * quietly filing it under "Other".
 */
export function inferCategory(tx: {
  category: string | null;
  kind: string | null;
  mercuryCategory: string | null;
}): ExpenseCategory | null {
  if (tx.category && (EXPENSE_CATEGORIES as readonly string[]).includes(tx.category)) {
    return tx.category as ExpenseCategory;
  }
  if (tx.kind && FEE_KINDS.has(tx.kind)) return 'Bank fees';
  if (tx.mercuryCategory && MERCURY_CATEGORY_MAP[tx.mercuryCategory]) {
    return MERCURY_CATEGORY_MAP[tx.mercuryCategory];
  }
  return null;
}
