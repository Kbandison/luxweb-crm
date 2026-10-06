import { describe, expect, it } from 'vitest';
import {
  changeOrderVariables,
  renderChangeOrderBody,
  safeBlock,
  type ChangeOrderContext,
  type ChangeOrderDraft,
} from './render';
import { defaultProposalContent } from '@/lib/types/proposal';

const ctx = (): ChangeOrderContext => {
  const content = defaultProposalContent({
    clientName: 'Dana Whitfield',
    clientEmail: 'dana@aurora.example',
    company: 'Aurora Dental LLC',
  });
  content.client.party = { kind: 'business', business_name: 'Aurora Dental LLC', signer_title: 'Owner' };
  return {
    number: 2,
    projectTitle: 'Aurora Dental site build',
    agreementSignedAt: '2026-10-07T16:45:00.000Z',
    agreementContent: content,
    previousTotalCents: 650000,
    netDays: 7,
  };
};

const draft = (over: Partial<ChangeOrderDraft> = {}): ChangeOrderDraft => ({
  title: 'Add online booking',
  description: 'Add an online booking page with deposits.',
  scopeLines: ['Booking page', 'Stripe deposit at booking'],
  amountCents: 120000,
  timelineWeeks: 2,
  billing: 'on_approval',
  ...over,
});

describe('change order body', () => {
  it('renders every section with no missing tokens', async () => {
    const body = await renderChangeOrderBody(changeOrderVariables(draft(), ctx()));
    expect(body).not.toMatch(/\[\[MISSING:|\{\{/);
    expect(body).toContain('# CHANGE ORDER No. 2');
    expect(body).toContain('for **Aurora Dental site build**, signed October 7, 2026');
    expect(body).toContain('**Aurora Dental LLC**, represented by **Dana Whitfield**, Owner');
    expect(body).toContain('- Booking page\n- Stripe deposit at booking');
    expect(body).toContain('adds **$1,200** to the Total Project Investment, invoiced when the added work is accepted under § 4');
    expect(body).toContain('payable Net 7');
    expect(body).toContain('**Total Project Investment before this Change Order:** $6,500');
    expect(body).toContain('**Total Project Investment after this Change Order:** $7,700');
    expect(body).toContain('extends the Estimated Duration by **2 weeks**');
    expect(body).toContain('**CLIENT:** Aurora Dental LLC, by Dana Whitfield, Owner');
  });

  it('bills on signing when chosen', () => {
    const v = changeOrderVariables(draft({ billing: 'on_signing' }), ctx());
    expect(v.price_clause).toContain('invoiced on signing this Change Order');
  });

  it('words a credit as a credit, never a refund', () => {
    const v = changeOrderVariables(draft({ amountCents: -50000, timelineWeeks: -1 }), ctx());
    expect(v.price_clause).toContain('reduces the Total Project Investment by **$500**, applied as a credit');
    expect(v.new_total).toBe('$6,000');
    expect(v.timeline_clause).toContain('shortens the Estimated Duration by **1 week**');
  });

  it('says so when price and timeline are unchanged', () => {
    const v = changeOrderVariables(draft({ amountCents: 0, timelineWeeks: 0, scopeLines: [] }), ctx());
    expect(v.price_clause).toBe('This Change Order does not change the Total Project Investment.');
    expect(v.timeline_clause).toBe('This Change Order does not change the timeline.');
    expect(v.scope_lines).toBe('');
  });
});

describe('safeBlock', () => {
  it("keeps paragraphs and bullets but won't let a line become a heading, table, or rule", () => {
    expect(safeBlock('# Big heading\n\nPlain.\n- a bullet\n| a | b |\n---')).toBe(
      'Big heading\n\nPlain.\n- a bullet\n a | b \n—',
    );
  });
});
