import Link from 'next/link';
import { Topbar } from '@/components/admin/topbar';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHead } from '@/components/ui/section-head';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { getEarningsOverview } from '@/lib/queries/admin';
import { formatUSD } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export default async function AdminEarningsPage() {
  const o = await getEarningsOverview();
  const monthDelta = o.lastMonth.paidCents
    ? Math.round(
        ((o.thisMonth.paidCents - o.lastMonth.paidCents) /
          o.lastMonth.paidCents) *
          100,
      )
    : null;

  return (
    <>
      <Topbar title="Earnings" />

      <main className="mx-auto w-full max-w-6xl space-y-12 px-6 pb-16 pt-10 md:px-10">
        <PageHeader
          eyebrow="Workspace"
          title="Earnings"
          description="Revenue from paid invoices, outstanding balance, and per-project profitability based on logged time and the project's hourly rate."
          actions={
            <a
              href="/api/admin/earnings/export.csv"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Export CSV
            </a>
          }
        />

        {/* Hero — this-month */}
        <HeroEarnings
          thisMonthCents={o.thisMonth.paidCents}
          thisMonthCount={o.thisMonth.invoiceCount}
          lastMonthCents={o.lastMonth.paidCents}
          deltaPct={monthDelta}
          ytdCents={o.ytd.paidCents}
        />

        {/* Outstanding */}
        <section className="space-y-5">
          <SectionHead
            number="02"
            title="Outstanding"
            description="Money you've billed but haven't been paid for."
            size="lg"
          />
          <div className="grid gap-4 md:grid-cols-2">
            <StatCard
              label="Sent · awaiting payment"
              value={formatUSD(o.outstanding.sentCents)}
              hint={`${o.outstanding.sentCount} ${o.outstanding.sentCount === 1 ? 'invoice' : 'invoices'}`}
              size="lg"
            />
            <StatCard
              label="Overdue"
              value={formatUSD(o.outstanding.overdueCents)}
              hint={`${o.outstanding.overdueCount} ${o.outstanding.overdueCount === 1 ? 'invoice' : 'invoices'}`}
              tone={o.outstanding.overdueCents > 0 ? 'danger' : 'default'}
              size="lg"
            />
          </div>
        </section>

        {/* Per-project breakdown */}
        <section className="space-y-5">
          <SectionHead
            number="03"
            title="Projects by profitability"
            description="Profit = paid revenue − (logged hours × project hourly rate). Projects without a rate set show cost as —."
            size="lg"
          />
          {o.projects.length === 0 ? (
            <EmptyState
              title="No projects with logged time yet"
              description="Open any project to set its hourly rate, then log hours to see profitability here."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full min-w-[820px]">
                <thead className="border-b border-border bg-surface text-left">
                  <tr className="font-mono text-[10px] uppercase tracking-meta text-ink-muted">
                    <th className="px-5 py-3 font-medium">Project</th>
                    <th className="px-3 py-3 font-medium">Client</th>
                    <th className="px-3 py-3 text-right font-medium">Rate</th>
                    <th className="px-3 py-3 text-right font-medium">Hours</th>
                    <th className="px-3 py-3 text-right font-medium">Cost</th>
                    <th className="px-3 py-3 text-right font-medium">Paid</th>
                    <th className="px-5 py-3 text-right font-medium">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {o.projects.map((p) => (
                    <tr
                      key={p.projectId}
                      className="border-b border-border last:border-b-0 transition-colors even:bg-surface-2/30 hover:bg-surface-2/50"
                    >
                      <td className="px-5 py-3 font-sans text-sm font-medium text-ink">
                        <Link
                          href={`/admin/projects/${p.projectId}`}
                          className="hover:text-copper"
                        >
                          {p.projectName}
                        </Link>
                      </td>
                      <td className="px-3 py-3 font-sans text-sm text-ink-muted">
                        {p.contactName}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-ink-muted">
                        {p.hourlyRateCents != null
                          ? `${formatUSD(p.hourlyRateCents)}/h`
                          : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-ink">
                        {p.hours.toFixed(1)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-ink-muted">
                        {p.hourlyRateCents != null
                          ? formatUSD(p.costCents)
                          : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-ink">
                        {formatUSD(p.paidCents)}
                      </td>
                      <td
                        className={cn(
                          'px-5 py-3 text-right font-mono text-sm font-medium tabular-nums',
                          p.profitCents > 0
                            ? 'text-success'
                            : p.profitCents < 0
                              ? 'bg-danger/5 text-danger'
                              : 'text-ink-muted',
                        )}
                      >
                        {formatUSD(p.profitCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

/* -------------------------------------------------------------------------
 * Hero — this-month earnings + delta + YTD
 * ------------------------------------------------------------------------- */
function HeroEarnings({
  thisMonthCents,
  thisMonthCount,
  lastMonthCents,
  deltaPct,
  ytdCents,
}: {
  thisMonthCents: number;
  thisMonthCount: number;
  lastMonthCents: number;
  deltaPct: number | null;
  ytdCents: number;
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-border bg-surface p-8 md:p-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-gradient-to-br from-copper/22 via-gold/12 to-transparent blur-3xl"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 copper-mesh opacity-50" />

      <div className="relative">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xl font-semibold tabular-nums text-copper">
            01
          </span>
          <span aria-hidden className="h-4 w-px bg-copper/40" />
          <p className="font-mono text-[11px] font-medium uppercase tracking-meta-hero text-copper">
            This month · paid
          </p>
        </div>

        <div className="mt-6 flex items-baseline gap-4">
          <span className="font-mono text-7xl font-medium leading-none tracking-tight tabular-nums text-ink md:text-8xl">
            {formatUSD(thisMonthCents)}
          </span>
          {deltaPct != null ? (
            <span
              className={cn(
                'font-mono text-sm tabular-nums',
                deltaPct >= 0 ? 'text-success' : 'text-danger',
              )}
            >
              {deltaPct >= 0 ? '↑' : '↓'} {Math.abs(deltaPct)}%
            </span>
          ) : null}
        </div>

        <dl className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-sans text-sm text-ink-muted">
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">Invoices paid this month</dt>
            <dd className="font-mono text-base font-medium tabular-nums text-ink">
              {thisMonthCount}
            </dd>
            <span>{thisMonthCount === 1 ? 'invoice paid' : 'invoices paid'}</span>
          </div>
          <span aria-hidden className="h-3 w-px bg-border" />
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">Last month total</dt>
            <span>vs.</span>
            <dd className="font-mono text-base font-medium tabular-nums text-ink">
              {formatUSD(lastMonthCents)}
            </dd>
            <span>last month</span>
          </div>
          <span aria-hidden className="h-3 w-px bg-border" />
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">YTD</dt>
            <dd className="font-mono text-base font-medium tabular-nums text-ink">
              {formatUSD(ytdCents)}
            </dd>
            <span>YTD</span>
          </div>
        </dl>
      </div>
    </section>
  );
}

