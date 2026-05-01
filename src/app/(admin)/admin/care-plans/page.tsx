import Link from 'next/link';
import { Topbar } from '@/components/admin/topbar';
import { getAllCarePlans } from '@/lib/queries/admin';
import { formatUSD, formatDateLong } from '@/lib/formatters';
import {
  CARE_PLAN_STATUS_LABEL,
  CARE_PLAN_STATUS_TONE,
} from '@/lib/care-plan/types';
import { cn } from '@/lib/utils';

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
      <Topbar title="Care Plans" />
      <main className="mx-auto w-full max-w-6xl space-y-6 px-8 py-8">
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-medium text-ink">
            Care Plans
          </h1>
          <p className="font-sans text-sm text-ink-muted">
            All recurring subscriptions across projects.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Active subs" value={String(activeCount)} />
          <Stat label="Monthly recurring" value={formatUSD(mrrCents)} />
          <Stat label="Total subs" value={String(plans.length)} />
        </div>

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
                        <p className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
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
                        <span
                          className={cn(
                            'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]',
                            CARE_PLAN_STATUS_TONE[p.status],
                          )}
                        >
                          {CARE_PLAN_STATUS_LABEL[p.status]}
                        </span>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
        {label}
      </p>
      <p className="mt-3 font-mono text-3xl font-medium tabular-nums tracking-tight text-ink">
        {value}
      </p>
    </div>
  );
}
