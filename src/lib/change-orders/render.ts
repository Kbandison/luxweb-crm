import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { formatDateLong, formatUSD } from '@/lib/formatters';
import {
  flattenLine,
  renderBullets,
  renderClientParty,
  renderSignatureParty,
} from '@/lib/contracts/render';
import type { ProposalContent } from '@/lib/types/proposal';

export type ChangeOrderBilling = 'on_approval' | 'on_signing';

/** What the studio fills in for a change order. */
export type ChangeOrderDraft = {
  title: string;
  description: string;
  scopeLines: string[];
  /** + adds to the price, − is a credit, 0 changes scope/timeline only. */
  amountCents: number;
  /** + extends the schedule, − shortens it. */
  timelineWeeks: number;
  /** When added work is billed. Ignored for credits and $0 changes. */
  billing: ChangeOrderBilling;
};

export type ChangeOrderContext = {
  number: number;
  projectTitle: string;
  agreementSignedAt: string;
  /** The signed agreement's snapshot — supplies the parties. */
  agreementContent: ProposalContent;
  /** Agreement total plus every change order already signed. */
  previousTotalCents: number;
  netDays: number;
};

/**
 * Free text the studio typed, made safe to place inside the contract body:
 * paragraphs and "- " bullets are kept, but a line can't turn itself into a
 * heading, a table, or a rule.
 */
export function safeBlock(text: string): string {
  const out = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      if (/^\s*#+\s*/.test(line)) return line.replace(/^\s*#+\s*/, '');
      if (/^\s*\|.*\|\s*$/.test(line)) return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
      if (/^\s*-{3,}\s*$/.test(line)) return '—';
      return line;
    })
    .join('\n')
    .trim();
  return out || '—';
}

export function changeOrderVariables(
  draft: ChangeOrderDraft,
  ctx: ChangeOrderContext,
): Record<string, string> {
  const amount = Math.round(draft.amountCents);
  const abs = formatUSD(Math.abs(amount));
  const net = Math.max(0, Math.floor(ctx.netDays));

  const price_clause =
    amount > 0
      ? draft.billing === 'on_signing'
        ? `This Change Order adds **${abs}** to the Total Project Investment, invoiced on signing this Change Order and payable Net ${net}.`
        : `This Change Order adds **${abs}** to the Total Project Investment, invoiced when the added work is accepted under § 4 of the Agreement and payable Net ${net}.`
      : amount < 0
        ? `This Change Order reduces the Total Project Investment by **${abs}**, applied as a credit against payments not yet invoiced. Any credit greater than the payments remaining will be settled between the parties in writing.`
        : 'This Change Order does not change the Total Project Investment.';

  const weeks = Math.trunc(draft.timelineWeeks);
  const unit = Math.abs(weeks) === 1 ? 'week' : 'weeks';
  const timeline_clause =
    weeks > 0
      ? `This Change Order extends the Estimated Duration by **${weeks} ${unit}**; the Target Launch Date moves by the same amount.`
      : weeks < 0
        ? `This Change Order shortens the Estimated Duration by **${-weeks} ${unit}**; the Target Launch Date moves by the same amount.`
        : 'This Change Order does not change the timeline.';

  const bullets = renderBullets(draft.scopeLines);

  return {
    number: String(ctx.number),
    title: flattenLine(draft.title),
    project_title: flattenLine(ctx.projectTitle),
    agreement_signed_date: formatDateLong(ctx.agreementSignedAt),
    client_party: renderClientParty(ctx.agreementContent),
    client_signature_party: renderSignatureParty(ctx.agreementContent),
    description: safeBlock(draft.description),
    scope_lines: bullets ? `**Scope changes:**\n\n${bullets}` : '',
    price_clause,
    previous_total: formatUSD(ctx.previousTotalCents),
    new_total: formatUSD(ctx.previousTotalCents + amount),
    timeline_clause,
  };
}

/** Render the change order body from the packaged template. */
export async function renderChangeOrderBody(variables: Record<string, string>): Promise<string> {
  const raw = await readFile(
    path.join(process.cwd(), 'src', 'content', 'change-order-v1.md'),
    'utf8',
  );
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const value = variables[key];
    return value ?? `[[MISSING:${key}]]`;
  });
}
