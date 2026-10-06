import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveContractVariables, renderAgreement } from './render';
import { CURRENT_AGREEMENT_VERSION } from './versions';
import {
  defaultProposalContent,
  pairTimelineAndMilestones,
  type ProposalContent,
} from '@/lib/types/proposal';

/**
 * The contract is generated from the agreement draft. These tests pin down
 * that every field the client agrees to lands in the section of the
 * Agreement it belongs in — and that every field on the draft has been
 * consciously placed somewhere (or consciously left out).
 */

/** Where each draft field goes. A new field fails the coverage test below until it's added here. */
const PLACEMENT: Record<string, string> = {
  'client.name': 'Parties + signature line',
  'client.contact_email': 'Parties',
  'client.party': 'Parties + signature line',
  'scope.pages_count': '§ 1.1',
  'scope.design': '§ 1.1',
  'scope.content_migration': '§ 1.1',
  'scope.integrations': '§ 1.1',
  'scope.security': '§ 1.1',
  'scope.performance': '§ 1.1',
  'scope.post_launch_support_months': '§ 1.1 + § 6',
  'scope.site_deliverables': '§ 1.1',
  out_of_scope: '§ 1.3',
  'timeline.phases': '§ 2.2 (+ phase payments in § 3)',
  'timeline.total_weeks': '§ 2.1',
  'timeline.target_launch': '§ 2.1',
  'investment.total_cents': '§ 3',
  'investment.milestones': '§ 3 (+ when work starts, § 2)',
  'investment.net_days': '§ 1.2 + § 3',
  'investment.late_fee': '§ 3',
  'investment.hourly_rate_cents': '§ 1.2',
  'investment.plan_version': '§ 3 billing clause',
  care_plan: '§ 1.2',
  assumptions: '§ 5',
  agreement_version: 'Selects the template',
  // Deliberately not contract terms:
  version: 'Not in contract — content schema version',
  prepared_date: 'Not in contract — draft date (Effective Date is the last signature)',
  note_to_client: 'Not in contract — personal note shown above it',
  executive_summary: 'Not in contract — legacy sales copy',
  project_goals: 'Not in contract — legacy sales copy',
  why_luxweb: 'Not in contract — legacy sales copy',
  next_steps: 'Not in contract — legacy sales copy',
};

/** Field paths on a draft: top-level keys, one level deep for the grouped ones. */
function fieldPaths(content: ProposalContent): string[] {
  const grouped = new Set(['client', 'scope', 'timeline', 'investment']);
  return Object.entries(content).flatMap(([key, value]) =>
    grouped.has(key) && value && typeof value === 'object'
      ? Object.keys(value).map((sub) => `${key}.${sub}`)
      : [key],
  );
}

/** A draft where every field carries a value that can only come from that field. */
function fullyCustom(): ProposalContent {
  const c = pairTimelineAndMilestones(
    defaultProposalContent({
      clientName: 'Dana Whitfield',
      clientEmail: 'dana@aurora.example',
      company: 'Aurora Dental LLC',
    }),
  );
  c.client.party = {
    kind: 'business',
    business_name: 'Aurora Dental LLC',
    business_description: 'a Georgia limited liability company',
    signer_title: 'Practice Owner',
  };
  c.note_to_client = 'NOTE-SENTINEL thanks for the great call';
  c.executive_summary = 'SUMMARY-SENTINEL';
  c.scope = {
    pages_count: 17,
    design: 'DESIGN-SENTINEL three revision rounds',
    content_migration: 'MIGRATION-SENTINEL',
    integrations: ['INTEGRATION-SENTINEL-A', 'INTEGRATION-SENTINEL-B'],
    security: 'SECURITY-SENTINEL',
    performance: 'PERFORMANCE-SENTINEL',
    post_launch_support_months: 5,
    site_deliverables: ['DELIVERABLE-SENTINEL online booking'],
  };
  c.out_of_scope = ['OOS-SENTINEL-A', 'OOS-SENTINEL-B'];
  c.timeline.phases = [
    { id: 'p0', name: 'PHASE-SENTINEL-DESIGN', weeks: '3', items: ['ITEM-SENTINEL-WIREFRAMES'] },
    { id: 'p1', name: 'PHASE-SENTINEL-BUILD', weeks: '6', items: ['ITEM-SENTINEL-CMS'] },
  ];
  c.timeline.total_weeks = 9;
  c.timeline.target_launch = '2027-03-15';
  c.investment = {
    plan_version: 2,
    total_cents: 1234500,
    milestones: [
      { kind: 'deposit', label: 'DEPOSIT-SENTINEL', percent: 40, amount_cents: 493800, due: 'DUE-SENTINEL-SIGNING' },
      { kind: 'phase', phase_id: 'p0', label: 'PHASE-SENTINEL-DESIGN', percent: 60, amount_cents: 740700, due: 'DUE-SENTINEL-APPROVAL' },
      { kind: 'phase', phase_id: 'p1', label: 'PHASE-SENTINEL-BUILD', percent: 0, amount_cents: 0, due: 'DUE-SENTINEL-ZERO' },
    ],
    net_days: 11,
    late_fee: 'LATEFEE-SENTINEL 2%/month',
    hourly_rate_cents: 13500,
  };
  c.care_plan = {
    recommended: true,
    name: 'CAREPLAN-SENTINEL',
    price_cents: 19900,
    interval: 'month',
    description: '',
    features: [],
  };
  c.assumptions = ['ASSUMPTION-SENTINEL-A', 'ASSUMPTION-SENTINEL-B'];
  c.agreement_version = CURRENT_AGREEMENT_VERSION;
  return c;
}

async function render(content: ProposalContent): Promise<string> {
  const variables = deriveContractVariables(content, { effectiveDate: '2026-10-06' });
  const { body_md } = await renderAgreement(variables, {
    version: content.agreement_version,
  });
  return body_md;
}

function between(body: string, from: string, to: string): string {
  const start = body.indexOf(from);
  const end = body.indexOf(to, start + from.length);
  expect(start, `missing "${from}"`).toBeGreaterThan(-1);
  expect(end, `missing "${to}" after "${from}"`).toBeGreaterThan(start);
  return body.slice(start, end);
}

describe('agreement field coverage', () => {
  it('places every field on the draft somewhere (or deliberately nowhere)', () => {
    const unplaced = fieldPaths(fullyCustom()).filter((p) => !(p in PLACEMENT));
    expect(unplaced, 'add these to PLACEMENT and map them into the Agreement').toEqual([]);
  });

  it('uses only tokens the variables provide, and every token resolves', async () => {
    const template = readFileSync(
      path.join(process.cwd(), 'src', 'content', `agreement-v${CURRENT_AGREEMENT_VERSION}.md`),
      'utf8',
    );
    const tokens = [...template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]);
    const variables = deriveContractVariables(fullyCustom(), { effectiveDate: '2026-10-06' });
    expect(tokens.filter((t) => !(t in variables))).toEqual([]);
    const body = await render(fullyCustom());
    expect(body).not.toMatch(/\[\[MISSING:|\{\{/);
  });
});

describe('every field lands in its section', () => {
  it('parties', async () => {
    const body = await render(fullyCustom());
    const parties = between(body, 'This Agreement is between:', '## 1.');
    expect(parties).toContain(
      '**Aurora Dental LLC**, a Georgia limited liability company, represented by **Dana Whitfield**, Practice Owner, contact: **dana@aurora.example** ("Client")',
    );
    expect(parties).toContain('effective on the date of the last signature');
  });

  it('§ 1.1 deliverables', async () => {
    const s11 = between(await render(fullyCustom()), '### 1.1', '### 1.2');
    for (const text of [
      'Up to **17** pages',
      'DESIGN-SENTINEL three revision rounds',
      'MIGRATION-SENTINEL',
      'INTEGRATION-SENTINEL-A, INTEGRATION-SENTINEL-B',
      'SECURITY-SENTINEL',
      'PERFORMANCE-SENTINEL',
      '5 months',
      '- DELIVERABLE-SENTINEL online booking',
    ]) {
      expect(s11).toContain(text);
    }
    expect(s11).not.toContain('Exhibit A');
  });

  it('§ 1.2 hourly rate, payment terms, care plan', async () => {
    const s12 = between(await render(fullyCustom()), '### 1.2', '### 1.3');
    expect(s12).toContain('**$135 per hour, Net 11**');
    expect(s12).toContain('**CAREPLAN-SENTINEL**, at **$199/month**');
  });

  it('§ 1.3 exclusions, verbatim, with the ADA line kept', async () => {
    const s13 = between(await render(fullyCustom()), '### 1.3', '### 1.4');
    expect(s13).toContain('- OOS-SENTINEL-A\n- OOS-SENTINEL-B');
    expect(s13).toContain('- ADA / WCAG compliance');
  });

  it('§ 2 schedule and phases', async () => {
    const s2 = between(await render(fullyCustom()), '## 2. Timeline', '## 3.');
    expect(s2).toContain('**Estimated Duration:** 9 weeks from signature of this Agreement and clearance of the Deposit.');
    expect(s2).toContain('March 15, 2027');
    expect(s2).toContain('**Phase 1: PHASE-SENTINEL-DESIGN** — 3 weeks');
    expect(s2).toContain('- ITEM-SENTINEL-WIREFRAMES');
    expect(s2).toContain('**Phase 2: PHASE-SENTINEL-BUILD** — 6 weeks');
    expect(s2).toContain('- ITEM-SENTINEL-CMS');
  });

  it('§ 3 total, payments, terms, and the deposit clause', async () => {
    const s3 = between(await render(fullyCustom()), '## 3. Payment Terms', '## 4.');
    expect(s3).toContain('**Total Project Investment: $12,345**');
    expect(s3).toContain('| DEPOSIT-SENTINEL | $4,938 | 40% | DUE-SENTINEL-SIGNING |');
    expect(s3).toContain('| PHASE-SENTINEL-DESIGN | $7,407 | 60% | DUE-SENTINEL-APPROVAL |');
    // A $0 phase is a milestone, not a payment.
    expect(s3).not.toContain('DUE-SENTINEL-ZERO');
    expect(s3).toContain('Net 11 from invoice date');
    expect(s3).toContain('LATEFEE-SENTINEL 2%/month');
    expect(s3).toContain("Each phase payment is invoiced when that phase's work is accepted under § 4.");
    expect(s3).toContain('The Deposit is earned by Contractor');
  });

  it('§ 5 assumptions', async () => {
    const s5 = between(await render(fullyCustom()), '## 5. Client Responsibilities', '## 6.');
    expect(s5).toContain('**Project assumptions.**');
    expect(s5).toContain('- ASSUMPTION-SENTINEL-A\n- ASSUMPTION-SENTINEL-B');
  });

  it('signature line', async () => {
    const sig = between(await render(fullyCustom()), '## SIGNATURES', '**CONTRACTOR:**');
    expect(sig).toContain('**CLIENT:** Aurora Dental LLC, by Dana Whitfield, Practice Owner');
  });

  it('keeps what is not a contract term out of the contract', async () => {
    const body = await render(fullyCustom());
    expect(body).not.toContain('NOTE-SENTINEL');
    expect(body).not.toContain('SUMMARY-SENTINEL');
    expect(body).not.toContain('Proposal');
  });
});

describe('variations', () => {
  it('names an individual as the party and signer', async () => {
    const c = fullyCustom();
    c.client.party = { kind: 'individual' };
    const body = await render(c);
    expect(between(body, 'This Agreement is between:', '## 1.')).toContain(
      '**Dana Whitfield**, contact: **dana@aurora.example** ("Client")',
    );
    expect(body).toContain('**CLIENT:** Dana Whitfield');
    expect(body).not.toContain('Aurora Dental LLC');
  });

  it('drops deposit language when there is no deposit', async () => {
    const c = fullyCustom();
    c.investment.milestones = c.investment.milestones.filter((m) => m.kind !== 'deposit');
    c.investment.milestones[0].amount_cents = c.investment.total_cents;
    const body = await render(c);
    expect(body).toContain('9 weeks from signature of this Agreement.');
    expect(body).toContain('Work begins upon signature of this Agreement.');
    expect(body).not.toContain('The Deposit is earned');
  });

  it('omits the assumptions block when there are none', async () => {
    const c = fullyCustom();
    c.assumptions = [];
    expect(await render(c)).not.toContain('Project assumptions');
  });

  it('keeps § 1.3 to the fixed ADA line when no exclusions are listed', async () => {
    const c = fullyCustom();
    c.out_of_scope = [];
    const s13 = between(await render(c), '### 1.3', '### 1.4');
    expect(s13.match(/^- /gm)).toHaveLength(1);
    expect(s13).toContain('- ADA / WCAG compliance');
  });

  it('defaults the hourly rate to $100 for drafts saved before it existed', async () => {
    const c = fullyCustom();
    delete c.investment.hourly_rate_cents;
    expect(await render(c)).toContain('**$100 per hour, Net 11**');
  });
});
