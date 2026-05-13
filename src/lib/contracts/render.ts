import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { formatUSD, formatDateLong } from '@/lib/formatters';
import type { ProposalContent } from '@/lib/types/proposal';
import type { ContractVariables } from '@/lib/types/contract';

/**
 * Derive the substitution variables for the Agreement from a proposal's
 * accepted content. Formatted for direct placement in the rendered body.
 */
export function deriveContractVariables(
  content: ProposalContent,
  opts: { effectiveDate: string },
): ContractVariables {
  const milestones = content.investment.milestones;
  const byLabel = (needle: string) =>
    milestones.find((m) => m.label.toLowerCase().includes(needle)) ?? null;

  // Legacy variables — only used if we ever render an older agreement
  // template that doesn't have {{milestones_table}}.
  const deposit = byLabel('deposit');
  const phase1 = byLabel('phase 1') ?? byLabel('design');
  const launch = byLabel('launch');

  // Every user-editable text value goes through flattenLine() so a
  // multi-paragraph proposal field (e.g., scope.design with a blank
  // line in it) doesn't break the markdown list it's substituted into.
  // Empty values collapse to em-dash so a bullet never renders blank.
  // Integrations are filtered + each entry is flattened individually
  // before being joined with commas.
  const integrations = (content.scope.integrations || [])
    .map((s) => flattenLine(s))
    .filter((s) => s !== '—');
  const integrationsLine = integrations.length > 0 ? integrations.join(', ') : '—';

  return {
    effective_date: formatDateLong(opts.effectiveDate),
    proposal_date: formatDateLong(content.prepared_date),
    client_name: flattenLine(content.client.name),
    client_email: flattenLine(content.client.contact_email),
    pages_count: String(content.scope.pages_count || 0),
    total_weeks: String(content.timeline.total_weeks || 0),
    target_launch: content.timeline.target_launch
      ? formatDateLong(content.timeline.target_launch)
      : 'TBD',
    total_amount: formatUSD(content.investment.total_cents),
    milestones_table: renderMilestonesTable(milestones),
    support_months: String(content.scope.post_launch_support_months || 0),
    net_days: String(content.investment.net_days || 0),
    late_fee: flattenLine(content.investment.late_fee),
    design: flattenLine(content.scope.design),
    content_migration: flattenLine(content.scope.content_migration),
    integrations_list: integrationsLine,
    security: flattenLine(content.scope.security),
    performance: flattenLine(content.scope.performance),
    deposit_amount: deposit ? formatUSD(deposit.amount_cents) : '—',
    phase1_amount: phase1 ? formatUSD(phase1.amount_cents) : '—',
    launch_amount: launch ? formatUSD(launch.amount_cents) : '—',
  };
}

/**
 * Flatten a user-editable proposal text field into a single line suitable
 * for substitution inside a markdown bullet, table cell, or inline span.
 *
 * - Splits on blank lines (paragraph breaks) and joins paragraphs with
 *   ". " — or just a space if the previous paragraph already ends with
 *   sentence-ending punctuation.
 * - Collapses any remaining intra-paragraph whitespace (single newlines,
 *   double spaces, tabs) to a single space.
 * - Returns an em-dash for null / undefined / empty / whitespace-only
 *   input so the surrounding markdown bullet never renders blank.
 *
 * Without this, multi-paragraph proposal text escapes its container —
 * a blank line in proposal.scope.design pushed the second paragraph out
 * of the deliverables bullet entirely.
 */
function flattenLine(input: string | null | undefined): string {
  const raw = (input ?? '').trim();
  if (!raw) return '—';
  const paragraphs = raw
    .split(/\n{2,}/g)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return '—';
  return paragraphs.reduce((acc, p, i) => {
    if (i === 0) return p;
    const sep = /[.!?]$/.test(acc) ? ' ' : '. ';
    return acc + sep + p;
  }, '');
}

/**
 * Pre-render the proposal's milestones as a markdown table with the
 * exact label / amount / percent / due text the client agreed to on
 * the proposal. Supports any number and shape of milestones, so a
 * custom proposal (e.g., 30/30/30/10) shows up correctly instead of
 * being squeezed into a fixed deposit/phase1/launch layout.
 */
function renderMilestonesTable(
  milestones: ProposalContent['investment']['milestones'],
): string {
  if (milestones.length === 0) {
    return '_No payment milestones defined in the proposal._';
  }
  const header =
    '| Milestone | Amount | % | Due |\n| --- | --- | --- | --- |';
  const rows = milestones.map((m) => {
    const label = m.label || '—';
    const amount = formatUSD(m.amount_cents);
    const percent = `${m.percent || 0}%`;
    const due = m.due || '—';
    return `| ${label} | ${amount} | ${percent} | ${due} |`;
  });
  return [header, ...rows].join('\n');
}

/**
 * Read the packaged Agreement markdown, substitute all {{tokens}}, and
 * return the rendered body alongside the exact variables used. The result
 * is stored verbatim on the contract row so the legal record is frozen.
 */
export async function renderAgreement(
  variables: ContractVariables,
  opts: { version?: string } = {},
): Promise<{ body_md: string; version: string }> {
  const version = opts.version ?? 'v1.1';
  // The on-disk filename uses the "v" prefix (e.g., agreement-v1.1.md), so
  // normalize whatever shape the caller passed (`'v1.1'` or `'1.1'`) into
  // the prefixed form.
  const fileSlug = version.startsWith('v') ? version : `v${version}`;
  const file = path.join(
    process.cwd(),
    'src',
    'content',
    `agreement-${fileSlug}.md`,
  );
  const raw = await readFile(file, 'utf8');

  // Strip the YAML frontmatter block (--- … ---) so it doesn't render.
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');

  const rendered = body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const value = (variables as Record<string, string>)[key];
    // Missing substitutions leave a visible placeholder instead of silently
    // producing an empty contract — easier to catch in review.
    return value ?? `[[MISSING:${key}]]`;
  });

  return { body_md: rendered, version };
}
