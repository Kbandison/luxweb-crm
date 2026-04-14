import Link from 'next/link';
import type { ProjectDetail } from '@/lib/queries/admin';
import { formatDate, formatUSD } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { PROJECT_STATUS_DOT, PROJECT_STATUS_LABEL } from './status-meta';

export function ProjectHeader({ project }: { project: ProjectDetail }) {
  return (
    <header className="relative isolate overflow-hidden border-b border-border bg-surface px-8 pb-7 pt-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br from-copper/18 via-gold/8 to-transparent blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px copper-rule"
      />

      <nav className="relative flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
        <Link href="/admin/projects" className="hover:text-ink">
          Projects
        </Link>
        <span className="text-copper">/</span>
        <span className="text-ink">{project.name}</span>
      </nav>

      <div className="relative mt-4 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <div className="min-w-0">
          <h2 className="font-display text-3xl font-medium tracking-tight text-ink">
            {project.name}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  PROJECT_STATUS_DOT[project.status],
                )}
                aria-hidden
              />
              {PROJECT_STATUS_LABEL[project.status]}
            </span>
            <Link
              href={`/admin/clients/${project.contactId}`}
              className="font-sans text-sm text-ink-muted hover:text-copper"
            >
              {project.contactName}
              {project.contactCompany ? (
                <span className="text-ink-subtle"> · {project.contactCompany}</span>
              ) : null}
            </Link>
            {project.startDate || project.endDate ? (
              <span className="font-mono text-xs tabular-nums text-ink-subtle">
                {formatDate(project.startDate)}
                {' → '}
                {formatDate(project.endDate)}
              </span>
            ) : null}
          </div>
        </div>

        {/* Stats cluster */}
        <dl className="flex items-end gap-8 text-right">
          <Stat
            label="Budget"
            value={
              project.budgetCents != null
                ? formatUSD(project.budgetCents)
                : '—'
            }
          />
          <Stat
            label="Profit"
            tooltip="Admin only — never sent to the client portal"
            value={
              project.profitabilityCents != null
                ? formatUSD(project.profitabilityCents)
                : '—'
            }
            adminOnly
          />
        </dl>
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  adminOnly = false,
  tooltip,
}: {
  label: string;
  value: string;
  adminOnly?: boolean;
  tooltip?: string;
}) {
  return (
    <div title={tooltip}>
      <dt
        className={cn(
          'flex items-center justify-end gap-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em]',
          adminOnly ? 'text-copper' : 'text-ink-muted',
        )}
      >
        {adminOnly ? <span aria-hidden>🔒</span> : null}
        {label}
      </dt>
      <dd className="mt-1 font-mono text-xl font-medium tabular-nums tracking-tight text-ink">
        {value}
      </dd>
    </div>
  );
}
