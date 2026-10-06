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
  // v1.2 scope fields — pulled verbatim from proposal.scope so the
  // Agreement reflects exactly what the client agreed to in the proposal
  // (not the template's default boilerplate). v1.1 ignored these.
  /** scope.design — e.g. "Custom UI/UX, two (2) revision rounds per phase." */
  design: string;
  /** scope.content_migration — e.g. "Port existing copy and imagery." */
  content_migration: string;
  /** scope.integrations rendered as inline markdown list. */
  integrations_list: string;
  /** scope.security — e.g. "HTTPS, best-practice hardening …" */
  security: string;
  /** scope.performance — e.g. "Image optimization, lazy-loading …" */
  performance: string;
  // v1.4 fields — the last two places the Agreement still printed its own
  // boilerplate instead of the proposal the client agreed to.
  /**
   * Pre-rendered markdown block listing scope.site_deliverables — the
   * features specific to this client's site — or an empty string when the
   * proposal lists none.
   */
  site_deliverables: string;
  /**
   * Pre-rendered markdown of the proposal's timeline phases (name, duration,
   * and items), replacing the template's fixed three-phase schedule.
   */
  project_phases: string;
  /**
   * Pre-rendered markdown clause naming the recommended care plan and its
   * agreed price, or an empty string when the proposal didn't recommend one.
   */
  care_plan_clause: string;
  // v1.5 fields — everything else the Agreement used to hardcode or leave
  // to the proposal-as-exhibit, now rendered from the agreement draft.
  /**
   * The Client line of the parties block: the person, or the business they
   * sign for (with its description, the signer and their title).
   */
  client_party: string;
  /** Who signs, as printed by the CLIENT signature line. */
  client_signature_party: string;
  /** § 1.2 rate, formatted — e.g. "$100". */
  hourly_rate: string;
  /** § 1.3 exclusions as markdown bullets (the ADA line stays in the template). */
  out_of_scope_list: string;
  /** § 5 "Project assumptions" block, or empty when there are none. */
  assumptions_block: string;
  /** When work starts — signature, plus the deposit if there is one. */
  work_start: string;
  /** § 3 note that phase payments bill on acceptance (phase plans only). */
  phase_billing_clause: string;
  /** § 3 deposit terms, or empty when the agreement has no deposit. */
  deposit_clause: string;
  // Legacy variables — kept so older agreement template revisions still
  // resolve cleanly. The current v1.2 template renders {{milestones_table}}
  // instead of these three individual amounts.
  deposit_amount: string;
  phase1_amount: string;
  launch_amount: string;
};
