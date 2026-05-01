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

  const deposit = byLabel('deposit');
  const phase1 = byLabel('phase 1') ?? byLabel('design');
  const launch = byLabel('launch');

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
    deposit_amount: deposit ? formatUSD(deposit.amount_cents) : '—',
    phase1_amount: phase1 ? formatUSD(phase1.amount_cents) : '—',
    launch_amount: launch ? formatUSD(launch.amount_cents) : '—',
  };
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
  const file = path.join(
    process.cwd(),
    'src',
    'content',
    `agreement-${version.replace(/^v/, '')}.md`,
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
