/**
 * LuxWeb proposal content model — stored verbatim in crm.proposals.content_json.
 * Mirrors the structure of the real LuxWeb Development Proposal doc.
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
  why_luxweb: Array<{ title: string; description: string }>;
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
    executive_summary:
      "You need a website that looks sharp, loads fast, and converts visitors into customers—without turning into a money pit six months down the line. We'll build you a modern, secure site that's easy to update and primed for growth, then back you up for three months post-launch so you're never left hanging.",
    project_goals: [
      {
        title: 'Professional Presence',
        description:
          'Convey credibility, capture leads, empower editing, and provide scalability.',
      },
      {
        title: 'Lead Generation',
        description:
          'Funnel visitors toward clear calls-to-action and capture qualified leads.',
      },
      {
        title: 'Ease of Management',
        description:
          'Empower your team to edit copy, swap images, and publish blog posts without touching code.',
      },
      {
        title: 'Scalable Foundation',
        description:
          'Clean, component-based code that can grow with new features (e-commerce, memberships, etc.) down the road.',
      },
    ],
    scope: {
      pages_count: 0,
      design: 'Custom UI/UX, two (2) revision rounds per phase.',
      content_migration: 'Port existing copy and imagery.',
      integrations: [
        'ActiveCampaign email capture',
        'Google Analytics',
        'Basic SEO setup',
      ],
      security:
        'HTTPS, best-practice hardening, critical updates applied pre-launch.',
      performance:
        'Image optimization, lazy-loading, Lighthouse >90% targets.',
      post_launch_support_months: 3,
    },
    out_of_scope: [
      'E-commerce or custom app features',
      'Ongoing hosting, domain, or SSL costs',
      'Ongoing content production',
      'Paid ads management',
    ],
    timeline: {
      phase_1: {
        name: 'Discovery & Design',
        weeks: '2',
        items: [
          'Goal & audience workshop',
          'Site map & wireframes',
          'Visual mock-ups → client review (3 business days)',
        ],
      },
      phase_2: {
        name: 'Build',
        weeks: '4',
        items: [
          'Responsive front-end & CMS setup',
          'Content migration and integrations',
          'Staging demo → client feedback (3 business days)',
        ],
      },
      phase_3: {
        name: 'Test & Launch',
        weeks: '1',
        items: [
          'Cross-browser / device QA',
          'Performance & security checks',
          'Final tweaks, go-live, hand-off training',
        ],
      },
      total_weeks: 7,
      target_launch: '',
    },
    investment: {
      total_cents: 0,
      milestones: [
        { label: 'Deposit', percent: 50, amount_cents: 0, due: 'On signing' },
        {
          label: 'Phase 1 Approval',
          percent: 25,
          amount_cents: 0,
          due: 'After design sign-off',
        },
        { label: 'Launch', percent: 25, amount_cents: 0, due: 'Before go-live' },
      ],
      net_days: 7,
      late_fee: '1.5%/month or legal max',
    },
    assumptions: [
      'Client will provide final copy, imagery, and brand assets within three (3) business days of request.',
      'One consolidated feedback round per phase; additional rounds billed at $100/hr.',
      "Hosting, domain, and SSL costs are the client's responsibility.",
    ],
    why_luxweb: [
      {
        title: 'Full-stack expertise',
        description: 'From Figma comps to production servers.',
      },
      {
        title: 'Performance-first mindset',
        description:
          'We treat site speed like a feature, not an afterthought.',
      },
      {
        title: 'Plain-English comms',
        description: 'No jargon, no ghosting, regular check-ins.',
      },
      {
        title: 'Future-proof code',
        description:
          'Modular components you can extend without a rebuild next year.',
      },
    ],
    next_steps: [
      'Review & sign the Agreement.',
      'Pay the 50% deposit (invoice sent upon signature).',
      'Kick-off call & scheduling — we get to work.',
    ],
    agreement_version: '1.1',
  };
}
