/**
 * Common ways money actually arrives when it doesn't come through Stripe.
 * Shared by Mark paid and the proposal's Collected milestone so the two
 * record payments in the same vocabulary.
 */
export const OFFLINE_PAYMENT_METHODS = [
  'Bank transfer / ACH',
  'Zelle',
  'Check',
  'Cash',
  'Wire',
  'Other',
] as const;
