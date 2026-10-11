// @vitest-environment jsdom
/**
 * Types into the real agreement builder the way a person does — click,
 * type, tab away, Save — and checks both what the box shows and what the
 * save sends. Reading the code missed bugs here twice (a box that ate the
 * space after each word, dollar boxes that appended to "0.00"); typing
 * catches them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/ui/toast';
import { ProposalEditor } from './proposal-editor';
import { defaultProposalContent, type ProposalContent } from '@/lib/types/proposal';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

type Saved = { title: string; total_cents: number; content_json: ProposalContent };
let saves: Saved[] = [];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderEditor() {
  saves = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH' && init.body) saves.push(JSON.parse(String(init.body)));
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  render(
    <ToastProvider>
      <ProposalEditor
        proposalId="p1"
        backHref="/admin/leads"
        backLabel="Lead"
        initialTitle="Website build"
        initialStatus="draft"
        initialContent={defaultProposalContent({
          clientName: 'Jane Doe',
          clientEmail: 'jane@acme.com',
          company: 'Acme LLC',
        })}
        initialSentAt={null}
        senderName="Kevin Bandison"
      />
    </ToastProvider>,
  );
  return userEvent.setup();
}

type Control = { el: HTMLInputElement; label: string; placeholder: string; type: string };

/** Every form control, in page order, with the label of the field it sits in. */
function controls(): Control[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea, select')).map(
    (el) => {
      let label = '';
      for (let node = el.parentElement, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
        const l = node.querySelector(':scope > label');
        if (l) {
          label = l.textContent?.trim() ?? '';
          break;
        }
      }
      const type = el.tagName === 'INPUT' ? el.type : el.tagName.toLowerCase();
      return { el, label, placeholder: el.getAttribute('placeholder') ?? '', type };
    },
  );
}

const byLabel = (label: string, n = 0) => controls().filter((c) => c.label === label)[n].el;
const byPlaceholder = (ph: string, n = 0) => controls().filter((c) => c.placeholder === ph)[n].el;
const shown = (ph: string) => controls().filter((c) => c.placeholder === ph).map((c) => c.el.value);

async function saveDraft(user: ReturnType<typeof userEvent.setup>): Promise<Saved> {
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  return saves.at(-1)!;
}

const WHOLE_NUMBER = new Set(['Pages count', 'Post-launch support (months)', 'Total weeks', 'Net days']);
const DOLLARS = new Set(['Total (USD)', 'Hourly rate', 'Price (USD)']);

describe('agreement builder text fields', () => {
  it('every text field and box keeps exactly what was typed, and saves it', { timeout: 60_000 }, async () => {
    const user = renderEditor();
    const typed: { name: string; text: string }[] = [];
    const problems: string[] = [];
    const count = controls().length;

    for (let i = 0; i < count; i++) {
      const c = controls()[i];
      if (['checkbox', 'select', 'date'].includes(c.type)) continue;
      if (WHOLE_NUMBER.has(c.label) || DOLLARS.has(c.label)) continue;
      if (c.placeholder === '%' || c.placeholder === 'USD') continue;
      const name = `#${i} ${c.label || c.placeholder || c.type}`;
      const text =
        c.type === 'textarea'
          ? `First line for ${i} here\nSecond line, with  two spaces & more`
          : `Field ${i}: O'Brien & Sons, LLC`;
      await user.clear(c.el);
      await user.type(c.el, text);
      if (controls()[i].el.value !== text) {
        problems.push(`${name} while typing → ${JSON.stringify(controls()[i].el.value)}`);
      }
      await user.tab();
      if (controls()[i].el.value !== text) {
        problems.push(`${name} after leaving → ${JSON.stringify(controls()[i].el.value)}`);
      }
      typed.push({ name, text });
    }

    const saved = JSON.stringify(await saveDraft(user));
    for (const t of typed) {
      for (const line of t.text.split('\n')) {
        // One-per-line boxes store trimmed lines; JSON-escape to match.
        if (!saved.includes(JSON.stringify(line.trim()).slice(1, -1))) {
          problems.push(`${t.name} didn't save ${JSON.stringify(line)}`);
        }
      }
    }

    expect(typed.length).toBeGreaterThan(30);
    expect(problems).toEqual([]);
  });

  it('whole-number fields clear and retype without a 0 snapping back', { timeout: 30_000 }, async () => {
    const user = renderEditor();
    for (const label of WHOLE_NUMBER) {
      await user.clear(byLabel(label));
      expect(byLabel(label).value, label).toBe('');
      await user.type(byLabel(label), '12');
      await user.tab();
      expect(byLabel(label).value, label).toBe('12');
    }
    await user.clear(byPlaceholder('%'));
    await user.type(byPlaceholder('%'), '150');
    expect(byPlaceholder('%').value).toBe('100');
  });
});

describe('agreement builder dollar boxes', () => {
  it('new agreement: click Total, type 5000 → $5,000 and the seeded split fills in', { timeout: 30_000 }, async () => {
    const user = renderEditor();
    const total = () => byLabel('Total (USD)');
    expect(total().value).toBe('');
    await user.click(total());
    await user.keyboard('5000');
    expect(total().value).toBe('5000');
    await user.tab();
    expect(total().value).toBe('5,000');
    expect(shown('USD')).toEqual(['2,500', '1,250', '', '1,250']);

    const s = await saveDraft(user);
    expect(s.total_cents).toBe(500_000);
    expect(s.content_json.investment.milestones.map((m) => [m.percent, m.amount_cents])).toEqual([
      [50, 250_000],
      [25, 125_000],
      [0, 0],
      [25, 125_000],
    ]);
  });

  it('clicking into a filled dollar box and typing replaces the amount', { timeout: 30_000 }, async () => {
    const user = renderEditor();
    for (const [label, keys, display] of [
      ['Hourly rate', '150', '150'],
      ['Price (USD)', '199.50', '199.50'],
      ['Total (USD)', '4000', '4,000'],
      ['Total (USD)', '$6,000.00', '6,000'],
    ] as const) {
      await user.click(byLabel(label));
      await user.keyboard(keys);
      await user.tab();
      expect(byLabel(label).value, label).toBe(display);
    }
    await user.click(byPlaceholder('USD', 0));
    await user.keyboard('1,000');
    await user.tab();
    expect(byPlaceholder('USD', 0).value).toBe('1,000');

    const s = await saveDraft(user);
    expect(s.total_cents).toBe(600_000);
    expect(s.content_json.investment.hourly_rate_cents).toBe(15_000);
    expect(s.content_json.investment.milestones[0].amount_cents).toBe(100_000);
  });

  it('tabbing through Total without a change leaves the payments alone', { timeout: 30_000 }, async () => {
    const user = renderEditor();
    await user.click(byLabel('Total (USD)'));
    await user.keyboard('4000');
    await user.tab();
    await user.click(byPlaceholder('USD', 1));
    await user.keyboard('500');
    await user.tab();
    const before = shown('USD');
    await user.click(byLabel('Total (USD)'));
    await user.tab();
    expect(shown('USD')).toEqual(before);
  });

  it('a percent typed before the total survives setting it', { timeout: 30_000 }, async () => {
    const user = renderEditor();
    await user.clear(byPlaceholder('%'));
    await user.type(byPlaceholder('%'), '30');
    await user.click(byLabel('Total (USD)'));
    await user.keyboard('10000');
    await user.tab();
    expect(byPlaceholder('%').value).toBe('30');
    expect(shown('USD')[0]).toBe('3,000');
  });

  it("something that isn't an amount puts the saved one back", { timeout: 30_000 }, async () => {
    const user = renderEditor();
    await user.click(byLabel('Hourly rate'));
    await user.keyboard('1.2.3');
    await user.tab();
    expect(byLabel('Hourly rate').value).toBe('100');
  });
});

describe('agreement builder controls behind a click', () => {
  it('party switch keeps the business name', { timeout: 30_000 }, async () => {
    const user = renderEditor();
    await user.clear(byLabel('Business legal name'));
    await user.type(byLabel('Business legal name'), 'Aurora Dental LLC');
    await user.click(screen.getByRole('button', { name: 'Themselves' }));
    expect(controls().some((c) => c.label === 'Business legal name')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'A business' }));
    expect(byLabel('Business legal name').value).toBe('Aurora Dental LLC');
    const s = await saveDraft(user);
    expect(s.content_json.client.party).toMatchObject({
      kind: 'business',
      business_name: 'Aurora Dental LLC',
    });
  });

  it('Collected reveals a date and method that save, and unticking clears them', { timeout: 30_000 }, async () => {
    const user = renderEditor();
    await user.click(byLabel('Total (USD)'));
    await user.keyboard('4000');
    await user.tab();
    await user.click(controls().find((c) => c.type === 'checkbox')!.el);
    fireEvent.change(screen.getByLabelText(/was received/), { target: { value: '2026-10-01' } });
    await user.selectOptions(screen.getByLabelText(/was paid/), 'Zelle');
    let deposit = (await saveDraft(user)).content_json.investment.milestones[0];
    expect(deposit).toMatchObject({
      collected: true,
      collected_on: '2026-10-01',
      collected_method: 'Zelle',
      amount_cents: 200_000,
    });

    await user.click(controls().find((c) => c.type === 'checkbox')!.el);
    deposit = (await saveDraft(user)).content_json.investment.milestones[0];
    expect(deposit.collected).toBe(false);
    expect(deposit.collected_on).toBeUndefined();
  });

  it('Add phase types normally and gets a payment row; Split evenly covers the total', { timeout: 30_000 }, async () => {
    const user = renderEditor();
    await user.click(screen.getByRole('button', { name: /Add phase/ }));
    const name = controls().filter((c) => c.label === 'Phase name').at(-1)!.el;
    await user.type(name, 'Content & SEO setup');
    expect(name.value).toBe('Content & SEO setup');
    expect(shown('Label').at(-1)).toBe('Content & SEO setup');

    await user.click(byLabel('Total (USD)'));
    await user.keyboard('10000');
    await user.tab();
    await user.click(screen.getByRole('button', { name: /Split evenly/ }));
    expect(shown('%')).toEqual(['20', '20', '20', '20', '20']);

    const s = await saveDraft(user);
    const sum = s.content_json.investment.milestones.reduce((a, m) => a + m.amount_cents, 0);
    expect(sum).toBe(1_000_000);
    expect(s.content_json.timeline.phases.at(-1)?.name).toBe('Content & SEO setup');
  });
});
