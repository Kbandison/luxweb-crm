import { describe, expect, it } from 'vitest';
import { defaultProposalContent } from '@/lib/types/proposal';
import { AgentProposalContentSchema } from '@/lib/validation/agent-proposals';
import { mergeDraftContent } from './agent-draft';

const base = () =>
  defaultProposalContent({
    clientName: 'Sam Lee',
    clientEmail: 'sam@acme.com',
    company: 'Acme Lawn',
  });

describe('mergeDraftContent', () => {
  it('keeps the defaults for everything not sent', () => {
    const merged = mergeDraftContent(base(), {});
    expect(merged.scope.design).toBe(base().scope.design);
    expect(merged.out_of_scope).toEqual(base().out_of_scope);
    expect(merged.investment.plan_version).toBe(2);
    expect(merged.client.party).toEqual({ kind: 'business', business_name: 'Acme Lawn', signer_title: '' });
  });

  it('merges a section one level deep and replaces its lists', () => {
    const merged = mergeDraftContent(base(), {
      scope: { pages_count: 6, site_deliverables: ['Online booking'] },
    });
    expect(merged.scope.pages_count).toBe(6);
    expect(merged.scope.site_deliverables).toEqual(['Online booking']);
    expect(merged.scope.integrations).toEqual(base().scope.integrations);
  });

  it('replaces the party as a whole', () => {
    const merged = mergeDraftContent(base(), {
      client: { party: { kind: 'business', business_name: 'Acme Lawn LLC', signer_title: 'Owner' } },
    });
    expect(merged.client.party).toEqual({
      kind: 'business',
      business_name: 'Acme Lawn LLC',
      signer_title: 'Owner',
    });
    expect(merged.client.name).toBe('Sam Lee');
  });

  it('pairs payment rows with phases the way the editor does', () => {
    const merged = mergeDraftContent(base(), {
      timeline: {
        phases: [
          { id: 'p0', name: 'Design', weeks: '1', items: ['Inner pages'] },
          { id: 'p1', name: 'Build', weeks: '1', items: ['Every page'] },
        ],
        total_weeks: 2,
      },
      investment: {
        total_cents: 250000,
        milestones: [
          { kind: 'deposit', label: 'Deposit', percent: 50, amount_cents: 125000, due: 'On signing' },
          { kind: 'phase', phase_id: 'p0', label: 'Design', percent: 50, amount_cents: 125000, due: 'On approval' },
          { kind: 'phase', phase_id: 'p9', label: 'Stray', percent: 0, amount_cents: 0, due: 'On approval' },
        ],
      },
    });
    expect(merged.investment.milestones.map((m) => [m.kind, m.phase_id ?? null, m.amount_cents])).toEqual([
      ['deposit', null, 125000],
      ['phase', 'p0', 125000],
      ['phase', 'p1', 0],
    ]);
    expect(merged.investment.net_days).toBe(base().investment.net_days);
  });

  it('lays an edit over stored content without losing earlier edits', () => {
    const first = mergeDraftContent(base(), { scope: { pages_count: 6 } });
    const second = mergeDraftContent(first, { note_to_client: 'Good talking today.' });
    expect(second.scope.pages_count).toBe(6);
    expect(second.note_to_client).toBe('Good talking today.');
  });
});

describe('AgentProposalContentSchema', () => {
  it('refuses a milestone marked collected, which would record a payment', () => {
    const parsed = AgentProposalContentSchema.safeParse({
      investment: {
        milestones: [
          { kind: 'deposit', label: 'Deposit', percent: 50, amount_cents: 100, due: 'On signing', collected: true },
        ],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses fields it does not know', () => {
    expect(AgentProposalContentSchema.safeParse({ agreement_version: '9.9' }).success).toBe(false);
  });
});
