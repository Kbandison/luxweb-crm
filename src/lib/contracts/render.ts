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

  // Scope fields come straight from the proposal so the Agreement
  // section 1.1 mirrors exactly what the client agreed to. Empty strings
  // collapse to em-dash so the contract never renders a stray blank
  // bullet ("- " on a line by itself). Multi-line values are flattened
  // to a single sentence-joined line so a blank line in the proposal
  // text doesn't break the markdown list (a blank line ends a bullet).
  const designLine = flattenScopeLine(content.scope.design);
  const migrationLine = flattenScopeLine(content.scope.content_migration);
  const securityLine = flattenScopeLine(content.scope.security);
  const performanceLine = flattenScopeLine(content.scope.performance);
  const integrations = (content.scope.integrations || []).filter((s) =>
    Boolean(s?.trim()),
  );
  const integrationsLine = integrations.length > 0 ? integrations.join(', ') : '—';

  return {
    effective_date: formatDateLong(opts.effectiveDate),
    proposal_date: formatDateLong(content.prepared_date),
    client_name: content.client.name || '—',
    client_email: content.client.contact_email || '—',
    pages_count: String(content.scope.pages_count || 0),
    total_weeks: String(content.timeline.total_weeks || 0),
    target_launch: content.timeline.target_launch
      ? formatDateLong(content.timeline.target_launch)
      : 'TBD',
    total_amount: formatUSD(content.investment.total_cents),
    milestones_table: renderMilestonesTable(milestones),
    support_months: String(content.scope.post_launch_support_months || 0),
    net_days: String(content.investment.net_days || 0),
    late_fee: content.investment.late_fee || '—',
    design: designLine,
    content_migration: migrationLine,
    integrations_list: integrationsLine,
    security: securityLine,
    performance: performanceLine,
    deposit_amount: deposit ? formatUSD(deposit.amount_cents) : '—',
    phase1_amount: phase1 ? formatUSD(phase1.amount_cents) : '—',
    launch_amount: launch ? formatUSD(launch.amount_cents) : '—',
  };
}

/**
 * Flatten a proposal scope text field into a single line suitable for a
 * markdown bullet. Splits on blank lines so paragraph breaks become
 * sentence breaks; trims, joins lines within each paragraph with a
 * space, and joins paragraphs with ". " (adding a period if the prior
 * paragraph didn't end with sentence-ending punctuation).
 *
 * Without this, multi-line proposal scope values escape their bullet —
 * the second paragraph renders as a stray line in the middle of the
 * deliverables list.
 */
function flattenScopeLine(input: string | null | undefined): string {
  const raw = (input ?? '').trim();
  if (!raw) return '—';
  // Split on blank lines (\n\n or more).
  const paragraphs = raw
    .split(/\n{2,}/g)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return '—';
  return paragraphs.reduce((acc, p, i) => {
    if (i === 0) return p;
    // If the previous chunk ends with sentence-ending punctuation, just
    // append a space; otherwise insert a period.
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
