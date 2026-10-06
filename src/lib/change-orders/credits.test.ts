import { describe, expect, it } from 'vitest';
import { allocateCredit, type CreditTarget } from './credits';
import { billingCheck } from './guard';

const m = (over: Partial<CreditTarget> & Pick<CreditTarget, 'id' | 'sort_order'>): CreditTarget => ({
  title: over.id,
  amount_cents: 100000,
  invoice_id: null,
  status: 'inactive',
  source: 'proposal',
  ...over,
});

describe('allocateCredit', () => {
  const plan = () => [
    m({ id: 'deposit', sort_order: 0, amount_cents: 200000, invoice_id: 'inv-1', status: 'done' }),
    m({ id: 'design', sort_order: 1, amount_cents: 100000, status: 'pending' }),
    m({ id: 'build', sort_order: 2, amount_cents: 0 }),
    m({ id: 'launch', sort_order: 3, amount_cents: 100000 }),
  ];

  it('takes the credit off the next unbilled payment', () => {
    expect(allocateCredit(plan(), 30000)).toEqual({
      lines: [{ milestone_id: 'design', from_cents: 100000, to_cents: 70000 }],
      unappliedCents: 0,
    });
  });

  it('spills into later payments when one is not enough', () => {
    expect(allocateCredit(plan(), 150000)).toEqual({
      lines: [
        { milestone_id: 'design', from_cents: 100000, to_cents: 0 },
        { milestone_id: 'launch', from_cents: 100000, to_cents: 50000 },
      ],
      unappliedCents: 0,
    });
  });

  it('never touches what is already billed or paid, and reports what is left', () => {
    expect(allocateCredit(plan(), 250000)).toEqual({
      lines: [
        { milestone_id: 'design', from_cents: 100000, to_cents: 0 },
        { milestone_id: 'launch', from_cents: 100000, to_cents: 0 },
      ],
      unappliedCents: 50000,
    });
  });

  it('skips a payment that has been invoiced but not paid', () => {
    const p = plan();
    p[1].invoice_id = 'inv-2';
    expect(allocateCredit(p, 30000).lines).toEqual([
      { milestone_id: 'launch', from_cents: 100000, to_cents: 70000 },
    ]);
  });

  it('ignores manual milestones', () => {
    expect(
      allocateCredit([m({ id: 'extra', sort_order: 0, source: 'manual' })], 10000),
    ).toEqual({ lines: [], unappliedCents: 10000 });
  });

  it('credits change-order work like any other unbilled payment', () => {
    expect(
      allocateCredit([m({ id: 'co1', sort_order: 5, source: 'change_order' })], 10000).lines,
    ).toEqual([{ milestone_id: 'co1', from_cents: 100000, to_cents: 90000 }]);
  });
});

describe('billingCheck', () => {
  it('allows an invoice that fits the contract', () => {
    expect(billingCheck({ contractedCents: 650000, billedCents: 325000, amountCents: 162500 })).toEqual({
      ok: true,
      remainingCents: 325000,
      overByCents: 0,
    });
  });

  it('allows the invoice that exactly finishes the contract', () => {
    expect(billingCheck({ contractedCents: 650000, billedCents: 487500, amountCents: 162500 }).ok).toBe(true);
  });

  it('flags one that would bill past it, by how much', () => {
    expect(billingCheck({ contractedCents: 650000, billedCents: 600000, amountCents: 100000 })).toEqual({
      ok: false,
      remainingCents: 50000,
      overByCents: 50000,
    });
  });

  it('counts a credit change order as lowering the contract', () => {
    // $6,500 agreement − $500 credit = $6,000 contracted.
    expect(billingCheck({ contractedCents: 650000 - 50000, billedCents: 600000, amountCents: 1 }).ok).toBe(false);
  });
});
