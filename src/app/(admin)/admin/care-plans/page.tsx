import Link from 'next/link';
import { Topbar } from '@/components/admin/topbar';
import { getAllCarePlans } from '@/lib/queries/admin';
import { StatCard } from '@/components/ui/stat-card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHead } from '@/components/ui/section-head';
import { StatusPill } from '@/components/ui/status-pill';
import { formatUSD, formatDateLong } from '@/lib/formatters';
import {
  CARE_PLAN_STATUS_LABEL,
  CARE_PLAN_STATUS_TONE,
} from '@/lib/care-plan/types';

export default async function AdminCarePlansPage() {
  const plans = await getAllCarePlans();

  const activeCount = plans.filter(
    (p) => p.status === 'active' || p.status === 'trialing',
  ).length;
  const mrrCents = plans
    .filter(
      (p) =>
        (p.status === 'active' || p.status === 'trialing') &&
        p.interval === 'month',
    )
    .reduce((s, p) => s + p.amountCents, 0);

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-6xl space-y-6 px-8 py-8">
        <PageHeader
          eyebrow="Workspace"
          title="Care Plans"
          description="All recurring subscriptions across projects."
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Active subs" value={String(activeCount)} size="lg" />
          <StatCard label="Monthly recurring" value={formatUSD(mrrCents)} size="lg" />
          <StatCard label="Total subs" value={String(plans.length)} size="lg" />
        </div>

        <SectionHead
          title="Queue"
          description={
            plans.length === 1 ? '1 subscription' : `${plans.length} subscriptions`
          }
        />

        {plans.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
            <p className="font-display text-lg font-medium text-ink">
              No Care Plans yet
            </p>
            <p className="mx-auto mt-2 max-w-md font-sans text-sm text-ink-muted">
              Enroll a project from its overview page to create the first
              subscription.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <ul className="divide-y divide-border">
              {plans.map((p) => {
                const href = p.projectId
                  ? `/admin/projects/${p.projectId}`
                  : '/admin/care-plans';
                const willCancel =
                  p.cancelAtPeriodEnd &&
                  (p.status === 'active' || p.status === 'trialing');
                return (
                  <li key={p.id}>
                    <Link
                      href={href}
                      className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-sans text-sm font-medium text-ink">
                          {p.projectName ?? p.contactName}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-meta-tight text-ink-subtle">
                          {p.contactName}
                          {p.currentPeriodEnd
                            ? ` · ${willCancel ? 'Cancels' : 'Renews'} ${formatDateLong(p.currentPeriodEnd)}`
                            : ''}
                          {p.paymentMethodLast4
                            ? ` · ${p.paymentMethodBrand?.toUpperCase()} ····${p.paymentMethodLast4}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-mono text-sm tabular-nums text-ink">
                          {formatUSD(p.amountCents)}
                          <span className="ml-1 font-sans text-xs text-ink-muted">
                            /{p.interval}
                          </span>
                        </span>
                        <StatusPill
                          label={CARE_PLAN_STATUS_LABEL[p.status]}
                          tone={CARE_PLAN_STATUS_TONE[p.status]}
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>
    </>
  );
}

