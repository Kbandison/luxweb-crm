import { CURRENT_AGREEMENT_VERSION } from '@/lib/contracts/versions';

/**
 * A single work phase in the proposal timeline. `id` is a stable key that
 * links the phase to its payment milestone (milestone.phase_id) so the two
 * survive being edited or pruned independently. Optional for tolerance of
 * proposals saved before the id existed; pairTimelineAndMilestones() assigns
 * one on load.
 */
export type TimelinePhase = {
  id?: string;
  name: string;
  weeks: string;
  items: string[];
};

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
 * Who the client is, contractually. Some clients sign as themselves; a
 * business signs through a person (the contact), who is named with their
 * title.
 */
export type ClientParty = {
  kind: 'individual' | 'business';
  /** Legal business name, e.g. "Aurora Dental LLC". Business only. */
  business_name?: string;
  /** e.g. "a Georgia limited liability company". Optional, business only. */
  business_description?: string;
  /** The signer's title at the business, e.g. "Owner". Business only. */
  signer_title?: string;
};

/**
 * LuxWeb proposal content model — stored verbatim in crm.proposals.content_json.
 * Mirrors the structure of the real LuxWeb Development Proposal doc.
 */
export type ProposalContent = {
  version: '1.0';
  client: {
    /** The person signing — must match the contact's name on file. */
    name: string;
    contact_email: string;
    /**
     * Who the Agreement is with. Absent on proposals saved before this
     * existed; read through clientParty(), which treats that as an
     * individual. Locked at send like everything else.
     */
    party?: ClientParty;
  };
  /**
   * Optional personal line shown above the agreement. Not part of the
   * contract — it never reaches the Agreement body.
   */
  note_to_client?: string;
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
    /**
     * Deliverables specific to this client's site — the features and pages
     * they actually asked for ("Online booking", "Menu with PDF download"),
     * as opposed to the standard scope lines above. Rendered as its own
     * block in the proposal and in Agreement 1.1 from v1.4 on. Optional
     * because proposals saved before the field existed don't carry it;
     * read it as `?? []`.
     */
    site_deliverables?: string[];
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
      /** Stable link to the timeline phase this milestone is billed for. */
      phase_id?: string;
      /**
       * On plan_version 2: the 'deposit' is the kickoff payment, billed at
       * signing and tied to no phase; each 'phase' row is billed when that
       * phase's work is approved. Absent on legacy plans.
       */
      kind?: 'deposit' | 'phase';
      /**
       * The client already paid this one outside the portal — typically a
       * deposit handed over before the contract was drawn up. Signing does
       * NOT raise an invoice for a collected milestone (which would ask the
       * client to pay twice); the milestone is seeded already done, and the
       * Agreement's payment table shows it as received rather than due.
       */
      collected?: boolean;
      /**
       * When a collected milestone's money arrived (YYYY-MM-DD). Signing
       * records it as a paid invoice dated this day, so the payment shows up
       * in Finances and can be matched to the bank deposit. Required to send.
       */
      collected_on?: string;
      /** How it arrived — Zelle, check, etc. Kept on the payment's audit row. */
      collected_method?: string;
    }>;
    net_days: number;
    late_fee: string;
    /**
     * Rate for work outside scope and after the Support Period (Agreement
     * § 1.2, and the termination math in § 13). Absent on older proposals —
     * read through hourlyRateCents().
     */
    hourly_rate_cents?: number;
    /**
     * 2 = a standalone deposit plus one payment per timeline phase (paying
     * is for work done). Absent = the legacy layout, where milestones were
     * paired to phases by position and the first one was billed at signing.
     * Legacy drafts keep their layout; they aren't converted.
     */
    plan_version?: 2;
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

/** Agreement § 1.2's rate for out-of-scope and post-support work. */
export const DEFAULT_HOURLY_RATE_CENTS = 10000;

/**
 * Agreement § 1.3's exclusions, as the editable default for a new
 * agreement. These are what the template hardcoded before § 1.3 rendered
 * from the proposal.
 */
export const DEFAULT_OUT_OF_SCOPE = [
  'Ongoing hosting fees',
  'Domain registration or renewal, and SSL certificates',
  'Content creation (text, images, videos)',
  'Email setup or configuration',
  'E-commerce functionality (unless specifically contracted)',
  'Advanced custom development beyond scope',
  'SEO work beyond basic metadata',
  'Paid ads management',
] as const;

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
  /** The contact's company, if any — prefills a business party. */
  company?: string | null;
}): ProposalContent {
  const company = opts.company?.trim();
  return {
    version: '1.0',
    client: {
      name: opts.clientName,
      contact_email: opts.clientEmail,
      // A contact with a company on file most likely signs for it; one
      // without signs as themselves. Either way it's a toggle in the editor.
      party: company
        ? { kind: 'business', business_name: company, signer_title: '' }
        : { kind: 'individual' },
    },
    note_to_client: '',
    prepared_date: new Date().toISOString().slice(0, 10),
    // The sales pitch (summary, goals, why LuxWeb, next steps) is no longer
    // part of a new agreement. The fields stay for older proposals that
    // carry them.
    executive_summary: '',
    project_goals: [],
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
      site_deliverables: [],
    },
    // Rendered verbatim as Agreement § 1.3. Seeded with everything the
    // template used to hardcode there, so nothing drops out by default;
    // the ADA / WCAG line stays fixed in the template either way.
    out_of_scope: [...DEFAULT_OUT_OF_SCOPE],
    timeline: {
      phases: [
        {
          id: 'p0',
          name: 'Discovery & Design',
          weeks: '2',
          items: [
            'Goal & audience workshop',
            'Site map & wireframes',
            'Visual mock-ups → client review (3 business days)',
          ],
        },
        {
          id: 'p1',
          name: 'Build',
          weeks: '4',
          items: [
            'Responsive front-end & CMS setup',
            'Content migration and integrations',
            'Staging demo → client feedback (3 business days)',
          ],
        },
        {
          id: 'p2',
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
    // Paying is for work done: a kickoff deposit at signing, then each
    // phase billed when its work is approved. Build carries no payment by
    // default — same 50 / 25 / 25 split as before, now tied to the right
    // phases. Every amount is editable, and a phase can be $0.
    investment: {
      plan_version: 2,
      total_cents: 0,
      milestones: [
        { kind: 'deposit', label: 'Deposit', percent: 50, amount_cents: 0, due: 'On signing' },
        { kind: 'phase', phase_id: 'p0', label: 'Discovery & Design', percent: 25, amount_cents: 0, due: 'On approval' },
        { kind: 'phase', phase_id: 'p1', label: 'Build', percent: 0, amount_cents: 0, due: 'On approval' },
        { kind: 'phase', phase_id: 'p2', label: 'Test & Launch', percent: 25, amount_cents: 0, due: 'On approval' },
      ],
      net_days: 7,
      late_fee: '1.5%/month or legal max',
      hourly_rate_cents: DEFAULT_HOURLY_RATE_CENTS,
    },
    care_plan: { ...DEFAULT_CARE_PLAN },
    assumptions: [
      'Client will provide final copy, imagery, and brand assets within three (3) business days of request.',
      'One consolidated feedback round per phase; additional rounds billed at the hourly rate.',
      "Hosting, domain, and SSL costs are the client's responsibility.",
    ],
    why_luxweb: [],
    next_steps: [],
    agreement_version: CURRENT_AGREEMENT_VERSION,
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
    id: p?.id,
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
 * Who the Agreement is with. Proposals saved before parties existed are
 * individuals — the client name was always the person.
 */
export function clientParty(content: ProposalContent): ClientParty {
  return content.client?.party ?? { kind: 'individual' };
}

/** The § 1.2 hourly rate, defaulting for proposals saved before it existed. */
export function hourlyRateCents(content: ProposalContent): number {
  const rate = content.investment?.hourly_rate_cents;
  return typeof rate === 'number' && rate > 0 ? rate : DEFAULT_HOURLY_RATE_CENTS;
}

/** True for the deposit + one-payment-per-phase layout (plan_version 2). */
export function isPhasePlan(content: ProposalContent): boolean {
  return content.investment?.plan_version === 2;
}

/**
 * Give every timeline phase a stable id and link each payment milestone to
 * its phase. Run on load; the editor keeps the link and the names in sync
 * thereafter.
 *
 * Phase plan (plan_version 2): one optional deposit first, then exactly one
 * payment row per phase in timeline order. A phase missing its row gets a
 * $0 one — every phase is a milestone the client approves, even when it
 * isn't billed. The deposit is never paired to a phase.
 *
 * Legacy plans: the two arrays were strictly 1:1 by index, so they pair by
 * position, and a blank milestone label is filled from its phase's name.
 */
export function pairTimelineAndMilestones(
  content: ProposalContent,
): ProposalContent {
  const phases = getTimelinePhases(content.timeline).map(
    (p, i): TimelinePhase => ({ ...p, id: p.id ?? `p${i}` }),
  );
  const timeline = {
    phases,
    total_weeks: content.timeline.total_weeks ?? 0,
    target_launch: content.timeline.target_launch ?? '',
  };

  if (isPhasePlan(content)) {
    const rows = content.investment.milestones;
    const deposit = rows.find((m) => m.kind === 'deposit');
    const phaseRows = phases.map((p) => {
      const row = rows.find((m) => m.kind !== 'deposit' && m.phase_id === p.id);
      return row
        ? { ...row, kind: 'phase' as const, label: row.label?.trim() ? row.label : p.name }
        : {
            kind: 'phase' as const,
            phase_id: p.id,
            label: p.name,
            percent: 0,
            amount_cents: 0,
            due: 'On approval',
          };
    });
    return {
      ...content,
      timeline,
      investment: {
        ...content.investment,
        milestones: deposit ? [deposit, ...phaseRows] : phaseRows,
      },
    };
  }

  const milestones = content.investment.milestones.map((m, i) => {
    const phaseId = m.phase_id ?? phases[i]?.id;
    const paired = phases.find((p) => p.id === phaseId);
    const label = m.label?.trim() ? m.label : (paired?.name ?? m.label);
    return { ...m, phase_id: phaseId, label };
  });
  return {
    ...content,
    timeline,
    investment: { ...content.investment, milestones },
  };
}
