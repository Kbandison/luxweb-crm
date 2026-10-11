import { describe, expect, it } from 'vitest';
import { percentsOf, rescaleSchedule } from './schedule';
import type { ProposalContent } from '@/lib/types/proposal';

type Milestone = ProposalContent['investment']['milestones'][number];

const m = (amount_cents: number, extra: Partial<Milestone> = {}): Milestone => ({
  label: 'Phase',
  percent: 0,
  amount_cents,
  due: '',
  ...extra,
});
const amounts = (ms: Milestone[]) => ms.map((x) => x.amount_cents);
const sum = (ms: Milestone[]) => ms.reduce((s, x) => s + x.amount_cents, 0);

describe('rescaleSchedule', () => {
  it('scales from exact amounts, not the rounded percents', () => {
    // $1,234.56 / $1,265.44 / $2,500 on $5,000 — percents round to 25/25/50,
    // which used to turn the first two into $1,250 each.
    const next = rescaleSchedule([m(123456), m(126544), m(250000)], 500000, 1000000);
    expect(amounts(next)).toEqual([246912, 253088, 500000]);
    expect(sum(next)).toBe(1000000);
  });

  it('keeps a schedule that covered the old total covering the new one', () => {
    const next = rescaleSchedule([m(100000), m(100000), m(100000)], 300000, 400000);
    expect(sum(next)).toBe(400000);
    expect(next.map((x) => x.percent)).toEqual([34, 33, 33]);
  });

  it('leaves collected payments alone and scales the rest into what remains', () => {
    const next = rescaleSchedule(
      [m(100000, { kind: 'deposit', collected: true }), m(150000), m(150000)],
      400000,
      500000,
    );
    expect(amounts(next)).toEqual([100000, 200000, 200000]);
  });

  it("fills a new agreement's seeded split from its percents", () => {
    const next = rescaleSchedule(
      [m(0, { percent: 50 }), m(0, { percent: 25 }), m(0, { percent: 0 }), m(0, { percent: 25 })],
      0,
      500000,
    );
    expect(amounts(next)).toEqual([250000, 125000, 0, 125000]);
    expect(next.map((x) => x.percent)).toEqual([50, 25, 0, 25]);
  });

  it('keeps typed amounts when there was no total to scale from', () => {
    const next = rescaleSchedule([m(50000), m(50000)], 0, 400000);
    expect(amounts(next)).toEqual([50000, 50000]);
    // 12.5% each, rounded together to the 25% they make up.
    expect(next.map((x) => x.percent)).toEqual([13, 12]);
  });

  it('keeps amounts when the new total is below what was collected', () => {
    const next = rescaleSchedule([m(100000, { collected: true }), m(50000)], 150000, 80000);
    expect(amounts(next)).toEqual([100000, 50000]);
  });
});

describe('percentsOf', () => {
  it('rounds together so a full schedule reads 100%', () => {
    expect(percentsOf([133333, 133333, 133334], 400000)).toEqual([33, 33, 34]);
  });

  it('is all zeros against a $0 total', () => {
    expect(percentsOf([5000, 0], 0)).toEqual([0, 0]);
  });
});
