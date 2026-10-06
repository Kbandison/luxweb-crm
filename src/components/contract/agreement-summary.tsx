import { Card } from '@/components/ui/card';
import { formatDateLong, formatUSD } from '@/lib/formatters';
import {
  clientParty,
  getTimelinePhases,
  type ProposalContent,
} from '@/lib/types/proposal';

/**
 * The plain-English summary above an agreement's full terms: what's being
 * built, when, and what's paid when. Rendered from the agreement as sent
 * (the contract's content snapshot), so it can't drift from the terms below
 * it — and it says that the terms are what's being signed.
 */
export function AgreementSummary({ content }: { content: ProposalContent }) {
  const party = clientParty(content);
  const phases = getTimelinePhases(content.timeline);
  const deliverables = content.scope.site_deliverables ?? [];
  const payments = content.investment.milestones.filter((m) => m.amount_cents > 0);
  const carePlan = content.care_plan?.recommended ? content.care_plan : null;

  return (
    <section className="space-y-5" aria-labelledby="agreement-summary-heading">
      <div>
        <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
          At a glance
        </p>
        <h2
          id="agreement-summary-heading"
          className="mt-1 font-display text-xl font-medium tracking-tight text-ink"
        >
          The short version
        </h2>
        <p className="mt-1 font-sans text-sm text-ink-muted">
          A summary for convenience — the full agreement below is what
          you&apos;re signing
          {party.kind === 'business' && party.business_name
            ? ` on behalf of ${party.business_name}`
            : ''}
          .
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card padding="lg" rounded="xl">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta text-ink-muted">
            What we&apos;re building
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 font-sans text-sm text-ink">
            {content.scope.pages_count > 0 ? (
              <li>Up to {content.scope.pages_count} pages</li>
            ) : null}
            {deliverables.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
            {content.scope.integrations.length > 0 ? (
              <li>Integrations: {content.scope.integrations.join(', ')}</li>
            ) : null}
            {content.scope.post_launch_support_months > 0 ? (
              <li>
                {content.scope.post_launch_support_months} months of support
                after launch
              </li>
            ) : null}
          </ul>
        </Card>

        <Card padding="lg" rounded="xl">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta text-ink-muted">
            Timeline
          </p>
          <ol className="mt-3 space-y-1.5 font-sans text-sm text-ink">
            {phases.map((p, i) => (
              <li key={p.id ?? i} className="flex justify-between gap-3">
                <span>
                  {i + 1}. {p.name || `Phase ${i + 1}`}
                </span>
                {p.weeks ? (
                  <span className="shrink-0 font-mono text-xs tabular-nums text-ink-muted">
                    {p.weeks} {p.weeks === '1' ? 'week' : 'weeks'}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="mt-3 font-mono text-[11px] tabular-nums text-ink-muted">
            About {content.timeline.total_weeks} weeks
            {content.timeline.target_launch
              ? ` · target launch ${formatDateLong(content.timeline.target_launch)}`
              : ''}
          </p>
        </Card>
      </div>

      <Card padding="lg" rounded="xl">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta text-ink-muted">
            Investment
          </p>
          <p className="font-mono text-2xl font-medium tabular-nums tracking-tight text-ink">
            {formatUSD(content.investment.total_cents)}
          </p>
        </div>
        {payments.length > 0 ? (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {payments.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="font-sans text-sm text-ink">{m.label}</p>
                  <p className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                    {m.collected ? 'Already received' : m.due}
                  </p>
                </div>
                <p className="font-mono text-sm tabular-nums text-ink">
                  {formatUSD(m.amount_cents)}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 font-mono text-[11px] tabular-nums text-ink-muted">
          Invoices are due Net {content.investment.net_days}
          {carePlan
            ? ` · optional ${carePlan.name}: ${formatUSD(carePlan.price_cents)}/${carePlan.interval === 'year' ? 'year' : 'month'} after launch`
            : ''}
        </p>
      </Card>
    </section>
  );
}
