export const CONTRACT_STATUSES = [
  'pending_signature',
  'signed',
  'void',
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/**
 * The substitution map used when rendering the Agreement markdown template.
 * Persisted on the contract row so we can audit exactly what was filled in
 * at the moment the client accepted the proposal.
 */
export type ContractVariables = {
  effective_date: string; // ISO date
  proposal_date: string; // ISO date
  client_name: string;
  client_email: string;
  pages_count: string;
  total_weeks: string;
  target_launch: string;
  total_amount: string; // formatted USD, e.g. "$4,800"
  deposit_amount: string;
  phase1_amount: string;
  launch_amount: string;
};
