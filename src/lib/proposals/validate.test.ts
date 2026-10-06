import { describe, expect, it } from 'vitest';
import { problemsBeforeSend } from './validate';
import {
  defaultProposalContent,
  type ProposalContent,
} from '@/lib/types/proposal';

function ready(edit?: (c: ProposalContent) => void): ProposalContent {
  const c = defaultProposalContent({
    clientName: 'Aurora Dental',
    clientEmail: 'ops@aurora.example',
  });
  c.investment.total_cents = 400000;
  c.investment.milestones = [
    { kind: 'deposit', label: 'Deposit', percent: 50, amount_cents: 200000, due: 'On signing' },
    { kind: 'phase', phase_id: 'p0', label: 'Design', percent: 25, amount_cents: 100000, due: 'On approval' },
    { kind: 'phase', phase_id: 'p1', label: 'Build', percent: 0, amount_cents: 0, due: 'On approval' },
    { kind: 'phase', phase_id: 'p2', label: 'Launch', percent: 25, amount_cents: 100000, due: 'On approval' },
  ];
  edit?.(c);
  return c;
}

describe('problemsBeforeSend', () => {
  it('passes a complete proposal', () => {
    expect(problemsBeforeSend(ready())).toEqual([]);
  });

  it('blocks a proposal with no total', () => {
    const problems = problemsBeforeSend(
      ready((c) => {
        c.investment.total_cents = 0;
      }),
    );
    expect(problems).toContain('Set the project total.');
  });

  it('blocks milestones that do not add up to the total', () => {
    const problems = problemsBeforeSend(
      ready((c) => {
        c.investment.milestones[3].amount_cents = 50000;
      }),
    );
    expect(problems).toEqual([
      'Payment milestones add up to $3,500 but the total is $4,000 (short by $500).',
    ]);
  });

  it('says "over" when milestones exceed the total', () => {
    const [problem] = problemsBeforeSend(
      ready((c) => {
        c.investment.milestones[0].amount_cents = 250000;
      }),
    );
    expect(problem).toContain('over by $500');
  });

  it('requires a client email that looks like one', () => {
    expect(
      problemsBeforeSend(
        ready((c) => {
          c.client.contact_email = '';
        }),
      ),
    ).toContain('Add the client contact email.');
    expect(
      problemsBeforeSend(
        ready((c) => {
          c.client.contact_email = 'aurora dental';
        }),
      )[0],
    ).toContain("doesn't look like an email address");
  });

  it('requires a received date on a collected milestone', () => {
    const problems = problemsBeforeSend(
      ready((c) => {
        c.investment.milestones[0].collected = true;
      }),
    );
    expect(problems).toEqual([
      'Deposit is marked collected — add the date it was received.',
    ]);
  });

  it('accepts a collected milestone that has its date', () => {
    expect(
      problemsBeforeSend(
        ready((c) => {
          c.investment.milestones[0].collected = true;
          c.investment.milestones[0].collected_on = '2026-09-02';
        }),
      ),
    ).toEqual([]);
  });

  it('requires at least one milestone', () => {
    expect(
      problemsBeforeSend(
        ready((c) => {
          c.investment.milestones = [];
        }),
      ),
    ).toContain('Add at least one payment milestone.');
  });

  it('requires every milestone to have a label', () => {
    expect(
      problemsBeforeSend(
        ready((c) => {
          c.investment.milestones[1].label = '  ';
        }),
      ),
    ).toContain('Milestone 2 needs a label.');
  });

  it('requires a business name when the client signs for a business', () => {
    expect(
      problemsBeforeSend(
        ready((c) => {
          c.client.party = { kind: 'business', business_name: ' ', signer_title: 'Owner' };
        }),
      ),
    ).toContain("Add the business's legal name, or switch the client to an individual.");
  });

  it('accepts an individual with no business details', () => {
    expect(
      problemsBeforeSend(
        ready((c) => {
          c.client.party = { kind: 'individual' };
        }),
      ),
    ).toEqual([]);
  });

  it('asks to remove a $0 deposit rather than send it', () => {
    expect(
      problemsBeforeSend(
        ready((c) => {
          c.investment.milestones[0].amount_cents = 0;
          c.investment.milestones[1].amount_cents = 300000;
        }),
      ),
    ).toEqual(['The deposit is $0 — set an amount or remove it.']);
  });

  it('allows no deposit at all', () => {
    expect(
      problemsBeforeSend(
        ready((c) => {
          c.investment.milestones = c.investment.milestones.slice(1);
          c.investment.milestones[0].amount_cents = 300000;
        }),
      ),
    ).toEqual([]);
  });

  it('requires at least one phase on a phase plan', () => {
    expect(
      problemsBeforeSend(
        ready((c) => {
          c.timeline.phases = [];
        }),
      ),
    ).toContain('Add at least one phase to the timeline.');
  });

  it('requires a positive hourly rate', () => {
    expect(
      problemsBeforeSend(
        ready((c) => {
          c.investment.hourly_rate_cents = 0;
        }),
      ),
    ).toContain('Set an hourly rate — § 1.2 bills out-of-scope work at it.');
  });
});
