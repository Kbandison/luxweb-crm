export const CONTRACT_STATUSES = [
  'pending_admin_signature',
  'pending_client_signature',
  // Legacy single-signature value — old rows stay readable.
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
  /** Pre-rendered markdown table of every milestone on the proposal. */
  milestones_table: string;
  /** Months of post-launch support, e.g. "3". */
  support_months: string;
  /** Invoice payment terms, e.g. "7" for Net 7. */
  net_days: string;
  /** Late-fee clause text, exactly as on the proposal. */
  late_fee: string;
  // Legacy variables — kept so older agreement template revisions still
  // resolve cleanly. The current v1.1 template renders {{milestones_table}}
  // instead of these three individual amounts.
  deposit_amount: string;
  phase1_amount: string;
  launch_amount: string;
};
