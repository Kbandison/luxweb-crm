import { formatUSD } from '@/lib/formatters';
import type { SetterEarnings } from '@/lib/queries/outreach';

/**
 * What the setter has earned. The scorecard covers activity (dials, book
 * rate); this is the number a commissioned setter actually works for.
 */
export function EarningsCard({
  earnings,
  commissionRate,
}: {
  earnings: SetterEarnings;
  commissionRate: number;
}) {
  const cells = [
    { label: 'This month', value: formatUSD(earnings.monthCents), strong: true },
    { label: 'All time', value: formatUSD(earnings.allTimeCents), strong: false },
    { label: 'Deals won', value: String(earnings.wonCount), strong: false },
    { label: 'Awaiting outcome', value: String(earnings.pendingCount), strong: false },
  ];

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-mono text-[10px] font-medium uppercase tracking-meta text-ink-subtle">
          Commission
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
          {Math.round(commissionRate * 100)}% of closed deals
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label}>
            <dt className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
              {c.label}
            </dt>
            <dd
              className={
                c.strong
                  ? 'mt-0.5 font-mono text-xl tabular-nums text-success'
                  : 'mt-0.5 font-mono text-xl tabular-nums text-ink'
              }
            >
              {c.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
