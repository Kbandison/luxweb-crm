import { Topbar } from '@/components/admin/topbar';
import { MetricTile } from '@/components/metric-tile';
import {
  getAdminDashboardOverview,
  type ActivityRow,
  type StageBucket,
} from '@/lib/queries/admin';
import { cn } from '@/lib/utils';
import { formatUSD, formatRelative, formatDateTimeCompactTz } from '@/lib/formatters';

export default async function AdminDashboardPage() {
  const o = await getAdminDashboardOverview();
  const now = new Date();

  return (
    <>
      <Topbar title="Dashboard" />

      <main className="mx-auto w-full max-w-6xl space-y-12 px-6 pb-16 pt-10 md:px-10">
        <PageMeta timestamp={now} />

        {/* 01 — Hero. The page's decorative copper moment, dialed up. */}
        <HeroPipeline
          valueCents={o.pipelineValueCents}
          dealCount={o.pipelineDealCount}
          avgCents={o.pipelineAvgCents}
          byStage={o.pipelineByStage}
        />

        {/* 02 — Snapshot */}
        <Section number="02" title="Snapshot" subtitle="Live counts across projects, invoices, and the inbox.">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricTile
              label="This month · paid"
              value={formatUSD(o.thisMonthEarningsCents)}
              delta={{
                value: `${o.thisMonthEarningsCount} ${o.thisMonthEarningsCount === 1 ? 'invoice' : 'invoices'}`,
                trend: 'flat',
              }}
            />
            <MetricTile
              label="Active projects"
              value={String(o.activeProjectCount)}
            />
            <MetricTile
              label="Unpaid invoices"
              value={formatUSD(o.unpaidInvoiceCents)}
              delta={{
                value: `${o.unpaidInvoiceCount} open`,
                trend: 'flat',
              }}
            />
            <MetricTile
              label="Unread messages"
              value={String(o.unreadMessagesCount)}
              unit="threads"
            />
          </div>
        </Section>

        {/* 03 — Activity */}
        <Section
          number="03"
          title="Recent activity"
          subtitle="Every admin mutation writes to the audit log. Latest 8 shown."
        >
          {o.recentActivity.length === 0 ? (
            <EmptyActivity />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <ul className="divide-y divide-border">
                {o.recentActivity.map((row) => (
                  <li key={row.id}>
                    <ActivityItem row={row} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      </main>
    </>
  );
}

/* -------------------------------------------------------------------------
 * Page meta — breadcrumb + live pill + last-updated
 * ------------------------------------------------------------------------- */
function PageMeta({ timestamp }: { timestamp: Date }) {
  const stamp = formatDateTimeCompactTz(timestamp);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-ink-subtle">
        <span>Admin</span>
        <span className="text-copper">/</span>
        <span className="text-ink">Overview</span>
      </nav>
      <time
        dateTime={timestamp.toISOString()}
        className="font-mono text-[10px] uppercase tracking-[0.2em] tabular-nums text-ink-subtle"
      >
        {stamp}
      </time>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Hero — amplified
 * ------------------------------------------------------------------------- */
function HeroPipeline({
  valueCents,
  dealCount,
  avgCents,
  byStage,
}: {
  valueCents: number;
  dealCount: number;
  avgCents: number;
  byStage: StageBucket[];
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-border bg-surface p-8 md:p-12">
      {/* Layered copper decorations */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-gradient-to-br from-copper/25 via-gold/15 to-transparent blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-gradient-to-tr from-copper-soft/60 via-transparent to-transparent blur-3xl"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 copper-mesh opacity-50" />

      <div className="relative">
        {/* Eyebrow */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-xl font-semibold tabular-nums text-copper">
            01
          </span>
          <span aria-hidden className="h-4 w-px bg-copper/40" />
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-copper">
            Pipeline value
          </p>
        </div>

        {/* Hero number */}
        <div className="mt-6 flex items-baseline gap-3">
          <span className="font-mono text-7xl font-medium leading-none tracking-tight tabular-nums text-ink md:text-8xl">
            {formatUSD(valueCents)}
          </span>
        </div>

        {/* Inline stats */}
        <dl className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-sans text-sm text-ink-muted">
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">Open deals</dt>
            <dd className="font-mono text-base font-medium tabular-nums text-ink">
              {dealCount}
            </dd>
            <span>open deals</span>
          </div>
          <span aria-hidden className="h-3 w-px bg-border" />
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">Average deal value</dt>
            <dd className="font-mono text-base font-medium tabular-nums text-ink">
              {formatUSD(avgCents)}
            </dd>
            <span>avg value</span>
          </div>
          <span aria-hidden className="h-3 w-px bg-border" />
          <span>Lead → Active stages only</span>
        </dl>

        {/* Stage breakdown */}
        <div className="mt-10 border-t border-border/60 pt-6">
          <div className="mb-4 flex items-center gap-2">
            <span aria-hidden className="h-2 w-0.5 rounded-full bg-copper" />
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-ink-muted">
              By stage
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {byStage.map((b) => (
              <StagePill key={b.stage} bucket={b} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StagePill({ bucket }: { bucket: StageBucket }) {
  const isOpen = ['lead', 'discovery', 'proposal', 'active'].includes(
    bucket.stage,
  );
  return (
    <div
      className={cn(
        'group rounded-lg border border-border bg-surface/80 p-3 transition-colors',
        isOpen ? 'hover:border-copper/40' : 'opacity-75',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            isOpen ? 'bg-copper' : 'bg-ink-subtle',
          )}
        />
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
          {bucket.label}
        </p>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-mono text-xl font-medium tabular-nums text-ink">
          {bucket.count}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-ink-subtle">
          {formatUSD(bucket.valueCents)}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Section wrapper — numbered
 * ------------------------------------------------------------------------- */
function Section({
  number,
  title,
  subtitle,
  children,
}: {
  number: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xl font-semibold tabular-nums text-copper">
              {number}
            </span>
            <span aria-hidden className="h-4 w-px bg-copper/40" />
            <h2 className="font-display text-xl font-medium tracking-tight text-ink">
              {title}
            </h2>
          </div>
          {subtitle ? (
            <p className="mt-1.5 max-w-xl font-sans text-sm text-ink-muted">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------
 * Activity feed — action badges + better empty state
 * ------------------------------------------------------------------------- */
function ActivityItem({ row }: { row: ActivityRow }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <ActionBadge action={row.action} />
        <div className="min-w-0">
          <p className="truncate font-sans text-sm text-ink">
            <span className="font-medium">{row.entityType}</span>
            {row.entityId ? (
              <span className="font-mono text-xs text-ink-subtle">
                {' '}· {row.entityId.slice(0, 8)}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 truncate font-sans text-xs text-ink-muted">
            {row.actorEmail ?? 'system'}
          </p>
        </div>
      </div>
      <time
        className="shrink-0 font-mono text-xs tabular-nums text-ink-subtle"
        dateTime={row.createdAt}
      >
        {formatRelative(row.createdAt)}
      </time>
    </div>
  );
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-success/10 text-success',
  update: 'bg-info/10 text-info',
  delete: 'bg-danger/10 text-danger',
  send: 'bg-copper/15 text-copper',
  accept: 'bg-success/15 text-success',
  reject: 'bg-danger/10 text-danger',
};

function ActionBadge({ action }: { action: string }) {
  const tone = ACTION_COLORS[action] ?? 'bg-ink/5 text-ink-muted';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]',
        tone,
      )}
    >
      {action}
    </span>
  );
}

function EmptyActivity() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center">
      <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-copper/15 via-copper-soft/50 to-transparent ring-1 ring-copper/15">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 text-copper/70"
          aria-hidden
        >
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      </div>
      <div className="space-y-1">
        <p className="font-display text-base font-medium text-ink">
          Waiting for the first event
        </p>
        <p className="mx-auto max-w-sm font-sans text-sm text-ink-muted">
          Add a lead, move a deal through pipeline, or send an invoice. Every
          admin mutation lands here.
        </p>
      </div>
    </div>
  );
}

