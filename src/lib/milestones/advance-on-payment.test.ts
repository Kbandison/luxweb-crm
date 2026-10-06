import { describe, expect, it } from 'vitest';
import { pickMilestoneForInvoice } from './advance-on-payment';

type Row = Parameters<typeof pickMilestoneForInvoice>[0][number];

function row(over: Partial<Row> & Pick<Row, 'id' | 'sort_order'>): Row {
  return {
    title: `Milestone ${over.sort_order + 1}`,
    status: 'inactive',
    source: 'proposal',
    invoice_id: null,
    amount_cents: 100000,
    ...over,
  };
}

const plan = () => [
  row({ id: 'dep', sort_order: 0, title: 'Deposit', status: 'pending', amount_cents: 200000, invoice_id: 'inv-dep' }),
  row({ id: 'des', sort_order: 1, title: 'Design', amount_cents: 100000 }),
  row({ id: 'lau', sort_order: 2, title: 'Launch', amount_cents: 100000 }),
];

describe('pickMilestoneForInvoice', () => {
  it('closes the milestone the invoice is linked to and unlocks the next', () => {
    const result = pickMilestoneForInvoice(plan(), {
      id: 'inv-dep',
      amountCents: 200000,
      description: 'Deposit — Site build',
    });
    expect(result.close?.id).toBe('dep');
    expect(result.linkLegacy).toBe(false);
    expect(result.unlock?.id).toBe('des');
  });

  it('ignores an invoice that belongs to no milestone', () => {
    // An hourly or change-order invoice must not close Design.
    const result = pickMilestoneForInvoice(plan(), {
      id: 'inv-hourly',
      amountCents: 30000,
      description: 'Extra edits — 3 hrs',
    });
    expect(result).toEqual({ close: null, linkLegacy: false, unlock: null });
  });

  it('ignores an unlinked invoice that merely matches an amount', () => {
    const result = pickMilestoneForInvoice(plan(), {
      id: 'inv-x',
      amountCents: 100000,
      description: 'Logo refresh — add-on',
    });
    expect(result.close).toBeNull();
  });

  it('does nothing when the same payment is delivered twice', () => {
    const rows = plan();
    rows[0].status = 'done';
    const result = pickMilestoneForInvoice(rows, {
      id: 'inv-dep',
      amountCents: 200000,
      description: 'Deposit — Site build',
    });
    expect(result).toEqual({ close: null, linkLegacy: false, unlock: null });
  });

  it('closes the right milestone when payments arrive out of order', () => {
    const rows = plan();
    rows[2].invoice_id = 'inv-lau';
    rows[2].status = 'in_progress';
    const result = pickMilestoneForInvoice(rows, {
      id: 'inv-lau',
      amountCents: 100000,
      description: 'Launch — Site build',
    });
    expect(result.close?.id).toBe('lau');
    expect(result.unlock).toBeNull();
  });

  it('links a legacy deposit invoice raised before invoices were linked', () => {
    const rows = plan();
    rows[0].invoice_id = null;
    const result = pickMilestoneForInvoice(rows, {
      id: 'inv-old',
      amountCents: 200000,
      description: 'Deposit — Site build',
    });
    expect(result.close?.id).toBe('dep');
    expect(result.linkLegacy).toBe(true);
    expect(result.unlock?.id).toBe('des');
  });

  it('does not unlock anything when a manual milestone is paid', () => {
    const rows = [
      ...plan(),
      row({ id: 'man', sort_order: 3, source: 'manual', status: 'in_progress', invoice_id: 'inv-man' }),
    ];
    const result = pickMilestoneForInvoice(rows, {
      id: 'inv-man',
      amountCents: 100000,
      description: 'Milestone 4 — Site build',
    });
    expect(result.close?.id).toBe('man');
    expect(result.unlock).toBeNull();
  });

  it('leaves an already-unlocked next milestone alone', () => {
    const rows = plan();
    rows[1].status = 'pending';
    const result = pickMilestoneForInvoice(rows, {
      id: 'inv-dep',
      amountCents: 200000,
      description: 'Deposit — Site build',
    });
    expect(result.close?.id).toBe('dep');
    expect(result.unlock).toBeNull();
  });
});
