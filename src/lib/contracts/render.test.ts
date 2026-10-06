import { describe, expect, it } from 'vitest';
import { deriveContractVariables, renderAgreement } from './render';
import {
  defaultProposalContent,
  pairTimelineAndMilestones,
  type ProposalContent,
} from '@/lib/types/proposal';

function proposal(edit: (c: ProposalContent) => void = () => {}): ProposalContent {
  const content = pairTimelineAndMilestones(
    defaultProposalContent({
      clientName: 'Aurora Dental',
      clientEmail: 'ops@aurora.example',
    }),
  );
  edit(content);
  return content;
}

async function render(content: ProposalContent) {
  const variables = deriveContractVariables(content, {
    effectiveDate: '2026-09-06',
  });
  const { body_md } = await renderAgreement(variables, {
    version: content.agreement_version,
  });
  return body_md;
}

/** The slice of the rendered agreement between two headings. */
function section(body: string, from: string, to: string): string {
  const start = body.indexOf(from);
  const end = body.indexOf(to, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return body.slice(start, end);
}

describe('renderAgreement', () => {
  it('leaves no unsubstituted tokens in the current template', async () => {
    const body = await render(proposal());
    expect(body).not.toMatch(/\[\[MISSING:/);
    expect(body).not.toMatch(/\{\{/);
  });
});

describe('project phases', () => {
  it('renders the proposal timeline rather than a fixed three-phase schedule', async () => {
    const body = await render(
      proposal((c) => {
        c.timeline.phases = [
          { id: 'p0', name: 'Discovery & Brand', weeks: '1', items: ['Goal workshop'] },
          {
            id: 'p1',
            name: 'Build & Booking Integration',
            weeks: '4',
            items: ['Front-end + CMS', 'Stripe booking deposit'],
          },
          { id: 'p2', name: 'Test & Launch', weeks: '1', items: [] },
        ];
      }),
    );
    const phases = section(body, '### 2.2 Project Phases', 'Work begins upon');

    expect(phases).toContain('**Phase 1: Discovery & Brand** — 1 week');
    expect(phases).toContain('**Phase 2: Build & Booking Integration** — 4 weeks');
    expect(phases).toContain('- Stripe booking deposit');
    // A phase with no items still gets its heading, and nothing else.
    expect(phases).toContain('**Phase 3: Test & Launch** — 1 week');
    // The old hardcoded schedule is gone.
    expect(phases).not.toContain('Requirements interview and site map');
    expect(phases).not.toContain('Cross-browser and responsive QA');
  });

  it('reads legacy phase_1/phase_2/phase_3 proposals', async () => {
    const content = proposal();
    // Proposals saved before the timeline became an array.
    (content.timeline as unknown as Record<string, unknown>).phases = undefined;
    Object.assign(content.timeline, {
      phase_1: { name: 'Design', weeks: '2', items: ['Wireframes'] },
      phase_2: { name: 'Build', weeks: '3', items: [] },
    });
    const phases = section(
      await render(content),
      '### 2.2 Project Phases',
      'Work begins upon',
    );
    expect(phases).toContain('**Phase 1: Design** — 2 weeks');
    expect(phases).toContain('**Phase 2: Build** — 3 weeks');
  });

  it('falls back to the Proposal by reference when there are no phases', async () => {
    const phases = section(
      await render(proposal((c) => (c.timeline.phases = []))),
      '### 2.2 Project Phases',
      'Work begins upon',
    );
    expect(phases).toContain('described in the Proposal incorporated as Exhibit A');
    expect(phases).not.toContain('**Phase');
  });

  it('keeps a multi-line phase item on one bullet', async () => {
    const phases = section(
      await render(
        proposal((c) => {
          c.timeline.phases = [
            { id: 'p0', name: 'Design', weeks: '', items: ['Mock-ups\n\nthen review'] },
          ];
        }),
      ),
      '### 2.2 Project Phases',
      'Work begins upon',
    );
    // No duration when the proposal leaves weeks blank.
    expect(phases).toContain('**Phase 1: Design**\n');
    expect(phases).toContain('- Mock-ups. then review');
  });
});

describe('site-specific deliverables', () => {
  it('lists the client-specific asks in section 1.1', async () => {
    const body = await render(
      proposal((c) => {
        c.scope.site_deliverables = [
          'Online booking with $50 deposit (Stripe)',
          'Insurance-accepted list, editable by staff',
        ];
      }),
    );
    const deliverables = section(body, '### 1.1 Deliverables', '### 1.2');
    expect(deliverables).toContain('**Site-specific deliverables.**');
    expect(deliverables).toContain('- Online booking with $50 deposit (Stripe)');
    expect(deliverables).toContain('- Insurance-accepted list, editable by staff');
  });

  it('omits the block entirely when the proposal lists none', async () => {
    const deliverables = section(
      await render(proposal((c) => (c.scope.site_deliverables = []))),
      '### 1.1 Deliverables',
      '### 1.2',
    );
    expect(deliverables).not.toContain('Site-specific deliverables');
  });

  it('omits the block for proposals saved before the field existed', async () => {
    const content = proposal();
    delete content.scope.site_deliverables;
    const deliverables = section(
      await render(content),
      '### 1.1 Deliverables',
      '### 1.2',
    );
    expect(deliverables).not.toContain('Site-specific deliverables');
  });
});

describe('section 1.1 scope', () => {
  it('mirrors the proposal scope instead of template boilerplate', async () => {
    const body = await render(
      proposal((c) => {
        c.scope.pages_count = 8;
        c.scope.design = "Custom UI/UX, two (2) revision rounds. Actor's list design.";
        c.scope.security = 'HTTPS + HIPAA-aware form handling.';
        c.scope.integrations = ['Stripe', 'Google Analytics'];
      }),
    );
    const deliverables = section(body, '### 1.1 Deliverables', '### 1.2');
    expect(deliverables).toContain("Actor's list design.");
    expect(deliverables).toContain('HTTPS + HIPAA-aware form handling.');
    expect(deliverables).toContain('**Integrations:** Stripe, Google Analytics');
    expect(deliverables).toContain('Up to **8** pages');
    expect(deliverables).not.toContain('Industry-standard security hardening');
  });
});

describe('payment schedule', () => {
  it('shows a collected milestone as received rather than due', async () => {
    const body = await render(
      proposal((c) => {
        c.investment.total_cents = 500000;
        c.investment.milestones = [
          {
            label: 'Deposit',
            percent: 50,
            amount_cents: 250000,
            due: 'On signing',
            collected: true,
          },
          {
            label: 'Launch',
            percent: 50,
            amount_cents: 250000,
            due: 'Before go-live',
          },
        ];
      }),
    );
    const payment = section(body, '## 3. Payment Terms', '## 4.');
    // The deposit reads as settled, so the signed document doesn't imply the
    // client still owes it.
    expect(payment).toContain(
      '| Deposit | $2,500 | 50% | **Received** — paid prior to signing |',
    );
    // Everything still outstanding keeps its due text.
    expect(payment).toContain('| Launch | $2,500 | 50% | Before go-live |');
  });

  it('leaves the due column alone when nothing was collected', async () => {
    const body = await render(
      proposal((c) => {
        c.investment.total_cents = 500000;
        c.investment.milestones = [
          { label: 'Deposit', percent: 100, amount_cents: 500000, due: 'On signing' },
        ];
      }),
    );
    const payment = section(body, '## 3. Payment Terms', '## 4.');
    expect(payment).toContain('| Deposit | $5,000 | 100% | On signing |');
    expect(payment).not.toContain('Received');
  });
});
