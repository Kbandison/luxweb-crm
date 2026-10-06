import {
  clientParty,
  getTimelinePhases,
  isPhasePlan,
  type ProposalContent,
} from '@/lib/types/proposal';
import { formatUSD } from '@/lib/formatters';

/**
 * Everything that would make a proposal unfit to send, as plain sentences
 * the editor can show as-is. Empty array = good to go.
 *
 * Run server-side on Send. The Agreement is rendered from these exact
 * numbers, so a payment plan that doesn't add up becomes a contract that
 * doesn't add up — better to stop it here than explain it later.
 */
export function problemsBeforeSend(content: ProposalContent): string[] {
  const problems: string[] = [];

  if (!content.client?.name?.trim()) {
    problems.push('Add the client name.');
  }
  const email = content.client?.contact_email?.trim() ?? '';
  if (!email) {
    problems.push('Add the client contact email.');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    problems.push(`"${email}" doesn't look like an email address.`);
  }

  const party = clientParty(content);
  if (party.kind === 'business' && !party.business_name?.trim()) {
    problems.push("Add the business's legal name, or switch the client to an individual.");
  }

  if (!content.prepared_date) {
    problems.push('Set the prepared date.');
  }

  const rate = content.investment?.hourly_rate_cents;
  if (rate != null && !(rate > 0)) {
    problems.push('Set an hourly rate — § 1.2 bills out-of-scope work at it.');
  }

  if (isPhasePlan(content)) {
    if (getTimelinePhases(content.timeline).length === 0) {
      problems.push('Add at least one phase to the timeline.');
    }
    const deposit = content.investment.milestones.find((m) => m.kind === 'deposit');
    if (deposit && !(deposit.amount_cents > 0)) {
      problems.push('The deposit is $0 — set an amount or remove it.');
    }
  }

  const total = content.investment?.total_cents ?? 0;
  if (!(total > 0)) {
    problems.push('Set the project total.');
  }

  const milestones = content.investment?.milestones ?? [];
  if (milestones.length === 0) {
    problems.push('Add at least one payment milestone.');
  } else if (total > 0) {
    const sum = milestones.reduce((s, m) => s + (m.amount_cents || 0), 0);
    if (sum !== total) {
      const diff = total - sum;
      problems.push(
        `Payment milestones add up to ${formatUSD(sum)} but the total is ` +
          `${formatUSD(total)} (${diff > 0 ? 'short' : 'over'} by ${formatUSD(Math.abs(diff))}).`,
      );
    }
  }

  milestones.forEach((m, i) => {
    const name = m.label?.trim() || `Milestone ${i + 1}`;
    if (!m.label?.trim()) {
      problems.push(`Milestone ${i + 1} needs a label.`);
    }
    if ((m.amount_cents ?? 0) < 0) {
      problems.push(`${name} can't be a negative amount.`);
    }
    if (m.collected && !m.collected_on) {
      problems.push(`${name} is marked collected — add the date it was received.`);
    }
  });

  return problems;
}
