/**
 * LuxWeb proposal content model — stored verbatim in crm.proposals.content_json.
 * Matches the shape locked in CRM_BUILD_COMPLETE.md Part 3.
 */
export type ProposalContent = {
  version: '1.0';
  client: {
    name: string;
    contact_email: string;
  };
  prepared_date: string; // ISO date (YYYY-MM-DD)
  executive_summary: string;
  project_goals: Array<{ title: string; description: string }>;
  scope: {
    pages_count: number;
    design: string;
    content_migration: string;
    integrations: string[];
    security: string;
    performance: string;
    post_launch_support_months: number;
  };
  out_of_scope: string[];
  timeline: {
    phase_1: { name: 'Discovery & Design'; weeks: string; items: string[] };
    phase_2: { name: 'Build'; weeks: string; items: string[] };
    phase_3: { name: 'Test & Launch'; weeks: string; items: string[] };
    total_weeks: number;
    target_launch: string; // ISO
  };
  investment: {
    total_cents: number;
    milestones: Array<{
      label: string;
      percent: number;
      amount_cents: number;
      due: string; // e.g., 'On signing'
    }>;
    net_days: number;
    late_fee: string;
  };
  assumptions: string[];
  why_luxweb: string[];
  next_steps: string[];
  agreement_version: string;
};

export const PROPOSAL_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export function defaultProposalContent(opts: {
  clientName: string;
  clientEmail: string;
}): ProposalContent {
  return {
    version: '1.0',
    client: {
      name: opts.clientName,
      contact_email: opts.clientEmail,
    },
    prepared_date: new Date().toISOString().slice(0, 10),
    executive_summary: '',
    project_goals: [],
    scope: {
      pages_count: 0,
      design: '',
      content_migration: '',
      integrations: [],
      security: '',
      performance: '',
      post_launch_support_months: 3,
    },
    out_of_scope: [],
    timeline: {
      phase_1: { name: 'Discovery & Design', weeks: '2', items: [] },
      phase_2: { name: 'Build', weeks: '4', items: [] },
      phase_3: { name: 'Test & Launch', weeks: '1', items: [] },
      total_weeks: 7,
      target_launch: '',
    },
    investment: {
      total_cents: 0,
      milestones: [
        { label: 'Deposit', percent: 50, amount_cents: 0, due: 'On signing' },
        { label: 'Launch', percent: 50, amount_cents: 0, due: 'Before go-live' },
      ],
      net_days: 7,
      late_fee: '1.5%/month or legal max',
    },
    assumptions: [],
    why_luxweb: [],
    next_steps: [],
    agreement_version: '1.1',
  };
}
