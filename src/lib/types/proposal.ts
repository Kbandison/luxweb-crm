/** A single work phase in the proposal timeline. */
export type TimelinePhase = { name: string; weeks: string; items: string[] };

/**
 * An ongoing care plan recommended in the proposal. This is an editable
 * snapshot the client reads — it is NOT a live link to the actual Stripe
 * subscription. The admin enrolls the real plan separately after launch.
 */
export type ProposalCarePlan = {
  /** When false, the care-plan section is hidden from the proposal entirely. */
  recommended: boolean;
  name: string;
  price_cents: number;
  interval: 'month' | 'year';
  description: string;
  features: string[];
};

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
    /**
     * Work phases, kept 1:1 with investment.milestones (one phase per
     * payment milestone). Variable length — the editor adds/removes a phase
     * whenever a milestone is added/removed. Proposals created before this
     * became milestone-driven stored a fixed phase_1/phase_2/phase_3 object
     * instead; read phases through getTimelinePhases() which tolerates both.
     */
    phases: TimelinePhase[];
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
  /** Recommended ongoing care plan, shown after Investment in the proposal. */
  care_plan: ProposalCarePlan;
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

/**
 * The standard LuxWeb Care Plan ($175/month). Used as the proposal's
 * default recommendation and to pre-fill the fields when an admin toggles
 * the recommendation on for a proposal that didn't have one.
 */
export const DEFAULT_CARE_PLAN: ProposalCarePlan = {
  recommended: true,
  name: 'LuxWeb Care Plan',
  price_cents: 17500,
  interval: 'month',
  description:
    'Keep your site fast, secure, and current after launch. We handle updates, monitoring, backups, and small edits so you never have to think about it.',
  features: [
    'Software, security & plugin updates',
    'Uptime monitoring and off-site backups',
    'Up to 1 hour of content edits each month',
    'Priority email support',
  ],
};

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
      phases: [
        {
          name: 'Discovery & Design',
          weeks: '2',
          items: [
            'Goal & audience workshop',
            'Site map & wireframes',
            'Visual mock-ups → client review (3 business days)',
          ],
        },
        {
          name: 'Build',
          weeks: '4',
          items: [
            'Responsive front-end & CMS setup',
            'Content migration and integrations',
            'Staging demo → client feedback (3 business days)',
          ],
        },
        {
          name: 'Test & Launch',
          weeks: '1',
          items: [
            'Cross-browser / device QA',
            'Performance & security checks',
            'Final tweaks, go-live, hand-off training',
          ],
        },
      ],
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
    care_plan: { ...DEFAULT_CARE_PLAN },
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
    agreement_version: '1.2',
  };
}

/**
 * Read a proposal's timeline phases as an array, tolerating both the
 * current array shape (`timeline.phases`) and the legacy fixed
 * phase_1/phase_2/phase_3 object that proposals saved before the timeline
 * became milestone-driven still carry. Use this everywhere phases are
 * rendered so old proposals keep displaying correctly.
 */
export function getTimelinePhases(timeline: {
  phases?: TimelinePhase[];
  phase_1?: Partial<TimelinePhase>;
  phase_2?: Partial<TimelinePhase>;
  phase_3?: Partial<TimelinePhase>;
}): TimelinePhase[] {
  const coerce = (p: Partial<TimelinePhase> | undefined): TimelinePhase => ({
    name: p?.name ?? '',
    weeks: p?.weeks ?? '',
    items: Array.isArray(p?.items) ? p.items : [],
  });
  if (Array.isArray(timeline?.phases)) {
    return timeline.phases.map(coerce);
  }
  return [timeline?.phase_1, timeline?.phase_2, timeline?.phase_3]
    .filter((p): p is Partial<TimelinePhase> => Boolean(p))
    .map(coerce);
}

/**
 * Backfill the care_plan section for proposals saved before it existed.
 * Legacy proposals get the standard plan details pre-filled but with the
 * recommendation OFF, so an old proposal doesn't start pitching a plan the
 * admin never chose — they can toggle it on with the fields already there.
 */
export function withCarePlanDefaults(content: ProposalContent): ProposalContent {
  if (content.care_plan) return content;
  return { ...content, care_plan: { ...DEFAULT_CARE_PLAN, recommended: false } };
}

/**
 * Force a proposal's timeline phases to line up 1:1 with its payment
 * milestones — one phase per milestone. Pads with a blank phase (named
 * after the milestone) when there are fewer phases than milestones, and
 * drops extras when there are more. Run on load so legacy proposals — and
 * any that drifted — open with the invariant already satisfied; the editor
 * then keeps it in sync as milestones are added/removed.
 */
export function reconcileTimelineToMilestones(
  content: ProposalContent,
): ProposalContent {
  const phases = getTimelinePhases(content.timeline);
  const next = content.investment.milestones.map(
    (m, i): TimelinePhase =>
      phases[i] ?? { name: m.label ?? '', weeks: '', items: [] },
  );
  return {
    ...content,
    timeline: {
      phases: next,
      total_weeks: content.timeline.total_weeks ?? 0,
      target_launch: content.timeline.target_launch ?? '',
    },
  };
}
