import { describe, expect, it } from 'vitest';
import {
  collectedPayments,
  depositForSigning,
  milestoneSeedRows,
  seedStatusForMilestones,
  signingPlan,
} from './on-sign';
import {
  defaultProposalContent,
  type ProposalContent,
} from '@/lib/types/proposal';

function content(
  milestones: ProposalContent['investment']['milestones'],
  totalCents = 500000,
): ProposalContent {
  const c = defaultProposalContent({
    clientName: 'Aurora Dental',
    clientEmail: 'ops@aurora.example',
  });
  c.investment.total_cents = totalCents;
  c.investment.milestones = milestones;
  // These cases exercise the legacy layout (first billable milestone is the
  // deposit); the phase-plan cases set plan_version back explicitly.
  delete c.investment.plan_version;
  return c;
}

const DEPOSIT = { label: 'Deposit', percent: 50, amount_cents: 250000, due: 'On signing' };
const PHASE1 = { label: 'Phase 1', percent: 25, amount_cents: 125000, due: 'After design' };
const LAUNCH = { label: 'Launch', percent: 25, amount_cents: 125000, due: 'Before go-live' };

describe('depositForSigning', () => {
  it('bills the first milestone that carries an amount', () => {
    expect(depositForSigning(content([DEPOSIT, PHASE1, LAUNCH]), null, 'x')).toEqual({
      amountCents: 250000,
      label: 'Deposit',
      milestoneIndex: 0,
    });
  });

  it('bills nothing when the deposit was already collected', () => {
    const c = content([{ ...DEPOSIT, collected: true }, PHASE1, LAUNCH]);
    expect(depositForSigning(c, null, 'x')).toBeNull();
  });

  it('does not slide down to phase 1 when the deposit is collected', () => {
    // The whole point: a collected deposit must not cause the client to be
    // invoiced early for work that hasn't started.
    const c = content([{ ...DEPOSIT, collected: true }, PHASE1, LAUNCH]);
    const result = depositForSigning(c, null, 'x');
    expect(result).toBeNull();
    expect(result).not.toMatchObject({ amountCents: 125000 });
  });

  it('bills nothing when every milestone is collected', () => {
    const c = content([
      { ...DEPOSIT, collected: true },
      { ...PHASE1, collected: true },
      { ...LAUNCH, collected: true },
    ]);
    expect(depositForSigning(c, null, 'x')).toBeNull();
  });

  it('still bills when a later milestone is collected but the deposit is not', () => {
    const c = content([DEPOSIT, { ...PHASE1, collected: true }, LAUNCH]);
    expect(depositForSigning(c, null, 'x')).toEqual({
      amountCents: 250000,
      label: 'Deposit',
      milestoneIndex: 0,
    });
  });

  it('skips zero-amount milestones when picking the deposit', () => {
    const c = content([{ ...DEPOSIT, amount_cents: 0 }, PHASE1, LAUNCH]);
    expect(depositForSigning(c, null, 'x')).toEqual({
      amountCents: 125000,
      label: 'Phase 1',
      milestoneIndex: 1,
    });
  });

  it('bills the full total when no milestone carries an amount', () => {
    const c = content([{ ...DEPOSIT, amount_cents: 0 }], 480000);
    expect(depositForSigning(c, null, 'Full project')).toEqual({
      amountCents: 480000,
      label: 'Full project',
      milestoneIndex: null,
    });
  });

  it('falls back to the proposal total when there is no content json', () => {
    expect(depositForSigning(null, 480000, 'x')).toEqual({
      amountCents: 480000,
      label: 'Deposit',
      milestoneIndex: null,
    });
    expect(depositForSigning(null, null, 'x')).toBeNull();
    expect(depositForSigning(null, 0, 'x')).toBeNull();
  });
});

describe('seedStatusForMilestones', () => {
  it('starts the deposit pending and locks the rest', () => {
    expect(seedStatusForMilestones([DEPOSIT, PHASE1, LAUNCH])).toEqual([
      'pending',
      'inactive',
      'inactive',
    ]);
  });

  it('marks a collected deposit done and opens the next phase', () => {
    expect(
      seedStatusForMilestones([{ ...DEPOSIT, collected: true }, PHASE1, LAUNCH]),
    ).toEqual(['done', 'pending', 'inactive']);
  });

  it('handles several collected milestones in a row', () => {
    expect(
      seedStatusForMilestones([
        { ...DEPOSIT, collected: true },
        { ...PHASE1, collected: true },
        LAUNCH,
      ]),
    ).toEqual(['done', 'done', 'pending']);
  });

  it('leaves nothing pending when everything was prepaid', () => {
    expect(
      seedStatusForMilestones([
        { ...DEPOSIT, collected: true },
        { ...PHASE1, collected: true },
        { ...LAUNCH, collected: true },
      ]),
    ).toEqual(['done', 'done', 'done']);
  });

  it('opens the first uncollected milestone even when a later one is collected', () => {
    expect(
      seedStatusForMilestones([DEPOSIT, { ...PHASE1, collected: true }, LAUNCH]),
    ).toEqual(['pending', 'done', 'inactive']);
  });

  it('returns nothing for an empty payment plan', () => {
    expect(seedStatusForMilestones([])).toEqual([]);
  });
});

describe('collectedPayments', () => {
  it('records each collected milestone with its date and method', () => {
    const c = content([
      {
        ...DEPOSIT,
        collected: true,
        collected_on: '2026-09-02',
        collected_method: 'Zelle',
      },
      PHASE1,
      LAUNCH,
    ]);
    expect(collectedPayments(c, '2026-10-06')).toEqual([
      {
        milestoneIndex: 0,
        amountCents: 250000,
        label: 'Deposit',
        paidOn: '2026-09-02',
        method: 'Zelle',
      },
    ]);
  });

  it('falls back to the signing date for legacy rows without one', () => {
    const c = content([{ ...DEPOSIT, collected: true }, PHASE1]);
    expect(collectedPayments(c, '2026-10-06')[0]).toMatchObject({
      paidOn: '2026-10-06',
      method: 'Not recorded',
    });
  });

  it('records nothing when nothing was collected', () => {
    expect(collectedPayments(content([DEPOSIT, PHASE1, LAUNCH]), '2026-10-06')).toEqual([]);
    expect(collectedPayments(null, '2026-10-06')).toEqual([]);
  });

  it('skips a collected milestone with no amount', () => {
    const c = content([{ ...DEPOSIT, amount_cents: 0, collected: true }, PHASE1]);
    expect(collectedPayments(c, '2026-10-06')).toEqual([]);
  });
});

describe('milestoneSeedRows', () => {
  it('keeps the proposal order so invoices can find their milestone', () => {
    const rows = milestoneSeedRows([DEPOSIT, PHASE1, LAUNCH], 'proj-1', '2026-10-06T00:00:00.000Z');
    expect(rows.map((r) => [r.sort_order, r.title, r.status])).toEqual([
      [0, 'Deposit', 'pending'],
      [1, 'Phase 1', 'inactive'],
      [2, 'Launch', 'inactive'],
    ]);
    expect(rows.every((r) => r.source === 'proposal' && r.project_id === 'proj-1')).toBe(true);
  });

  it('seeds a collected milestone done, stamped, and labelled as prepaid', () => {
    const [deposit] = milestoneSeedRows(
      [{ ...DEPOSIT, collected: true }, PHASE1],
      'proj-1',
      '2026-10-06T00:00:00.000Z',
    );
    expect(deposit.status).toBe('done');
    expect(deposit.completed_at).toBe('2026-10-06T00:00:00.000Z');
    expect(deposit.description).toBe('$2500 · On signing · paid prior to signing');
  });
});

describe('depositForSigning on a phase plan', () => {
  function phasePlan(
    milestones: ProposalContent['investment']['milestones'],
  ): ProposalContent {
    const c = content(milestones, 400000);
    c.investment.plan_version = 2;
    return c;
  }
  const DEP = { kind: 'deposit' as const, label: 'Deposit', percent: 50, amount_cents: 200000, due: 'On signing' };
  const DESIGN = { kind: 'phase' as const, phase_id: 'p0', label: 'Design', percent: 25, amount_cents: 100000, due: 'On approval' };
  const BUILD = { kind: 'phase' as const, phase_id: 'p1', label: 'Build', percent: 0, amount_cents: 0, due: 'On approval' };
  const LAUNCH_P = { kind: 'phase' as const, phase_id: 'p2', label: 'Launch', percent: 25, amount_cents: 100000, due: 'On approval' };

  it('bills the deposit row', () => {
    expect(depositForSigning(phasePlan([DEP, DESIGN, BUILD, LAUNCH_P]), null, 'x')).toEqual({
      amountCents: 200000,
      label: 'Deposit',
      milestoneIndex: 0,
    });
  });

  it('bills nothing at signing when there is no deposit', () => {
    // Phase payments wait for approval — never billed at signature.
    expect(depositForSigning(phasePlan([DESIGN, BUILD, LAUNCH_P]), null, 'x')).toBeNull();
  });

  it('bills nothing when the deposit was collected', () => {
    expect(
      depositForSigning(phasePlan([{ ...DEP, collected: true }, DESIGN, LAUNCH_P]), null, 'x'),
    ).toBeNull();
  });

  it('seeds the deposit pending and every phase locked, $0 phases included', () => {
    expect(seedStatusForMilestones([DEP, DESIGN, BUILD, LAUNCH_P])).toEqual([
      'pending',
      'inactive',
      'inactive',
      'inactive',
    ]);
  });
});

describe('signingPlan', () => {
  const opts = { title: 'Site build', totalCents: 400000, signedAt: '2026-10-07T16:45:00.000Z' };
  function phasePlan(milestones: ProposalContent['investment']['milestones']) {
    const c = content(milestones, 400000);
    c.investment.plan_version = 2;
    return c;
  }
  const DEP = { kind: 'deposit' as const, label: 'Deposit', percent: 50, amount_cents: 200000, due: 'On signing' };
  const DESIGN = { kind: 'phase' as const, phase_id: 'p0', label: 'Design', percent: 50, amount_cents: 200000, due: 'On approval' };

  it('waits for the deposit before work starts', () => {
    const plan = signingPlan(phasePlan([DEP, DESIGN]), opts);
    expect(plan.depositState).toBe('pending');
    expect(plan.startNow).toBe(false);
    expect(plan.milestones.map((m) => [m.sort_order, m.title, m.status])).toEqual([
      [0, 'Deposit', 'pending'],
      [1, 'Design', 'inactive'],
    ]);
    expect(plan.prepaid).toEqual([]);
  });

  it('starts work at signature when there is no deposit', () => {
    const plan = signingPlan(phasePlan([{ ...DESIGN, amount_cents: 400000 }]), opts);
    expect(plan.depositState).toBe('not_required');
    expect(plan.startNow).toBe(true);
    expect(plan.milestones[0].status).toBe('pending');
  });

  it('records a collected deposit as a dated paid invoice and starts work', () => {
    const plan = signingPlan(
      phasePlan([
        { ...DEP, collected: true, collected_on: '2026-09-02', collected_method: 'Zelle' },
        DESIGN,
      ]),
      opts,
    );
    expect(plan.depositState).toBe('collected');
    expect(plan.startNow).toBe(true);
    expect(plan.milestones.map((m) => m.status)).toEqual(['done', 'pending']);
    expect(plan.prepaid).toEqual([
      {
        sort_order: 0,
        description: 'Deposit — Site build',
        amount_cents: 200000,
        paid_at: '2026-09-02T12:00:00.000Z',
        method: 'Zelle',
      },
    ]);
  });
});
