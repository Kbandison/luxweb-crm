import { describe, expect, it } from 'vitest';
import { depositForSigning, seedStatusForMilestones } from './on-sign';
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
    });
  });

  it('skips zero-amount milestones when picking the deposit', () => {
    const c = content([{ ...DEPOSIT, amount_cents: 0 }, PHASE1, LAUNCH]);
    expect(depositForSigning(c, null, 'x')).toEqual({
      amountCents: 125000,
      label: 'Phase 1',
    });
  });

  it('bills the full total when no milestone carries an amount', () => {
    const c = content([{ ...DEPOSIT, amount_cents: 0 }], 480000);
    expect(depositForSigning(c, null, 'Full project')).toEqual({
      amountCents: 480000,
      label: 'Full project',
    });
  });

  it('falls back to the proposal total when there is no content json', () => {
    expect(depositForSigning(null, 480000, 'x')).toEqual({
      amountCents: 480000,
      label: 'Deposit',
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
