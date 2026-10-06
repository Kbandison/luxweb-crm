import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { formatUSD, formatDateLong } from '@/lib/formatters';
import {
  clientParty,
  getTimelinePhases,
  hourlyRateCents,
  isPhasePlan,
} from '@/lib/types/proposal';
import type { ProposalContent, TimelinePhase } from '@/lib/types/proposal';
import type { ContractVariables } from '@/lib/types/contract';
import {
  AGREEMENT_VERSIONS,
  isKnownAgreementVersion,
  normalizeAgreementVersion,
} from '@/lib/contracts/versions';

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

  // The deposit is the kind 'deposit' row on a phase plan, or the first
  // billable milestone on a legacy one (which always opened with it).
  const hasDeposit = isPhasePlan(content)
    ? milestones.some((m) => m.kind === 'deposit' && m.amount_cents > 0)
    : milestones.some((m) => m.amount_cents > 0);

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
    site_deliverables: renderSiteDeliverables(content.scope.site_deliverables),
    project_phases: renderProjectPhases(getTimelinePhases(content.timeline)),
    care_plan_clause: renderCarePlanClause(content.care_plan),
    client_party: renderClientParty(content),
    client_signature_party: renderSignatureParty(content),
    hourly_rate: formatUSD(hourlyRateCents(content)),
    out_of_scope_list: renderBullets(content.out_of_scope),
    assumptions_block: renderAssumptions(content.assumptions),
    work_start: hasDeposit
      ? 'signature of this Agreement and clearance of the Deposit'
      : 'signature of this Agreement',
    phase_billing_clause: isPhasePlan(content)
      ? "Each phase payment is invoiced when that phase's work is accepted under § 4."
      : '',
    deposit_clause: hasDeposit ? DEPOSIT_CLAUSE : '',
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
export function flattenLine(input: string | null | undefined): string {
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
 *
 * A milestone the client already paid says so in the Due column instead of
 * naming a due date. That belongs in the signed document: it's the record
 * that the money changed hands before the Agreement existed, and it stops
 * the table from reading as though the deposit is still owed.
 */
function renderMilestonesTable(
  milestones: ProposalContent['investment']['milestones'],
): string {
  // A $0 phase isn't a payment — it's still a milestone the client
  // approves, but it has no place in the payment schedule.
  const billed = milestones.filter((m) => m.amount_cents > 0);
  if (billed.length === 0) {
    return '_No payment milestones defined in the proposal._';
  }
  const header =
    '| Milestone | Amount | % | Due |\n| --- | --- | --- | --- |';
  const rows = billed.map((m) => {
    const label = m.label || '—';
    const amount = formatUSD(m.amount_cents);
    const percent = `${m.percent || 0}%`;
    const due = m.collected
      ? m.collected_on
        ? `**Received** ${formatDateLong(m.collected_on)} — paid prior to signing`
        : '**Received** — paid prior to signing'
      : m.due || '—';
    return `| ${label} | ${amount} | ${percent} | ${due} |`;
  });
  return [header, ...rows].join('\n');
}

/**
 * Render the client's site-specific deliverables as a markdown block for
 * Agreement 1.1. These are the features the client actually asked for
 * ("Online booking", "Menu with PDF download") as opposed to the standard
 * scope lines, so they belong in the signed document and not just the
 * proposal. Returns an empty string when the proposal lists none, so the
 * Agreement simply omits the block. Legacy proposals predate the field.
 */
function renderSiteDeliverables(items: string[] | undefined): string {
  const lines = (items || [])
    .map((s) => flattenLine(s))
    .filter((s) => s !== '—');
  if (lines.length === 0) return '';
  return [
    '**Site-specific deliverables.** In addition to the above, the Project ' +
      "includes the following items specific to Client's site:",
    '',
    ...lines.map((s) => `- ${s}`),
  ].join('\n');
}

/**
 * Render the proposal's timeline phases as the Agreement's phase schedule.
 * The template used to hardcode a fixed Discovery / Build / Test & Launch
 * list, so a proposal with renamed, added, or removed phases produced a
 * contract that contradicted the proposal it was derived from.
 *
 * Emits one bold phase line (with its duration) followed by that phase's
 * items as a flat bullet list — the only markdown shapes ContractBody
 * renders, and deliberately no nesting, which it would flatten anyway.
 */
function renderProjectPhases(phases: TimelinePhase[]): string {
  if (phases.length === 0) {
    return (
      'The Project phases are those described in the Proposal incorporated ' +
      'as Exhibit A.'
    );
  }
  return phases
    .map((phase, i) => {
      const name = flattenLine(phase.name);
      const heading =
        name === '—' ? `Phase ${i + 1}` : `Phase ${i + 1}: ${name}`;
      const weeks = flattenLine(phase.weeks);
      const duration =
        weeks === '—'
          ? ''
          : ` — ${weeks} ${weeks === '1' ? 'week' : 'weeks'}`;
      const items = (phase.items || [])
        .map((it) => flattenLine(it))
        .filter((it) => it !== '—')
        .map((it) => `- ${it}`);
      const head = `**${heading}**${duration}`;
      return items.length > 0 ? [head, '', ...items].join('\n') : head;
    })
    .join('\n\n');
}

/**
 * Render the optional ongoing-care-plan clause for the Agreement. Returns
 * the markdown paragraph (with the agreed name + price) when the proposal
 * recommended a care plan, or an empty string otherwise — so an agreement
 * for a proposal without a care plan simply omits the clause. Legacy
 * proposals predate the field, so a missing care_plan is treated as "none".
 */
function renderCarePlanClause(
  carePlan: ProposalContent['care_plan'] | undefined,
): string {
  if (!carePlan?.recommended) return '';
  const name = flattenLine(carePlan.name);
  const displayName = name === '—' ? 'Care Plan' : name;
  const price = formatUSD(carePlan.price_cents);
  const interval = carePlan.interval === 'year' ? 'year' : 'month';
  return (
    `**Ongoing Care Plan (Optional).** Contractor offers an optional ongoing ` +
    `care plan, the **${displayName}**, at **${price}/${interval}**, to keep ` +
    `the site updated, secure, monitored, and backed up after the Support ` +
    `Period. The care plan is optional, billed separately, is not included in ` +
    `the Total Project Investment, and may be started or cancelled by Client ` +
    `at any time.`
  );
}

/**
 * § 3's deposit terms, carried over unchanged from earlier revisions. Only
 * rendered when the agreement actually has a deposit — otherwise it would
 * describe a payment that doesn't exist.
 */
const DEPOSIT_CLAUSE =
  'The Deposit is earned by Contractor upon commencement of work and is ' +
  'non-refundable once work has begun. If Client terminates before ' +
  'Contractor has begun any substantive work, the Deposit will be refunded ' +
  'less any documented out-of-pocket costs already incurred specifically ' +
  'for this Project (e.g., paid software licenses, stock photography, or ' +
  'third-party service fees).';

/**
 * The Client line of the parties block. A business is the party, named with
 * its description, and signs through the contact — who is named with their
 * title so it's clear they sign on its behalf.
 */
export function renderClientParty(content: ProposalContent): string {
  const party = clientParty(content);
  const person = flattenLine(content.client.name);
  const email = flattenLine(content.client.contact_email);
  if (party.kind !== 'business') {
    return `**${person}**, contact: **${email}**`;
  }
  const business = flattenLine(party.business_name);
  const description = optionalLine(party.business_description);
  const title = optionalLine(party.signer_title);
  return (
    `**${business}**` +
    (description ? `, ${description}` : '') +
    `, represented by **${person}**` +
    (title ? `, ${title}` : '') +
    `, contact: **${email}**`
  );
}

/** The CLIENT signature line: the person, or "Business, by Person, Title". */
export function renderSignatureParty(content: ProposalContent): string {
  const party = clientParty(content);
  const person = flattenLine(content.client.name);
  if (party.kind !== 'business') return person;
  const title = optionalLine(party.signer_title);
  return `${flattenLine(party.business_name)}, by ${person}${title ? `, ${title}` : ''}`;
}

/** Markdown bullets, one per non-empty line; empty string when none. */
export function renderBullets(items: readonly string[] | undefined): string {
  return (items ?? [])
    .map((s) => flattenLine(s))
    .filter((s) => s !== '—')
    .map((s) => `- ${s}`)
    .join('\n');
}

/**
 * § 5's project assumptions — what the price and schedule depend on the
 * client doing. Omitted entirely when the draft lists none.
 */
function renderAssumptions(items: readonly string[] | undefined): string {
  const bullets = renderBullets(items);
  if (!bullets) return '';
  return [
    '**Project assumptions.** The schedule and Total Project Investment assume:',
    '',
    bullets,
  ].join('\n');
}

/** A trimmed single line, or '' when blank (where flattenLine gives '—'). */
function optionalLine(input: string | null | undefined): string {
  const line = flattenLine(input);
  return line === '—' ? '' : line;
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
  // Refuse anything that isn't a real template revision, with an error that
  // says so — otherwise a typo surfaces as an opaque ENOENT from readFile.
  if (!isKnownAgreementVersion(version)) {
    throw new Error(
      `Unknown agreement version "${version}". Known: ${AGREEMENT_VERSIONS.join(', ')}.`,
    );
  }
  // The on-disk filename uses the "v" prefix (e.g., agreement-v1.1.md), so
  // normalize whatever shape the caller passed (`'v1.1'` or `'1.1'`) into
  // the prefixed form.
  const fileSlug = `v${normalizeAgreementVersion(version)}`;
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
