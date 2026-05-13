import Link from 'next/link';
import type { ProjectDetail } from '@/lib/queries/admin';
import { formatDate, formatUSD } from '@/lib/formatters';
import { ProjectStatusEditor } from './project-status-editor';

export function ProjectHeader({ project }: { project: ProjectDetail }) {
  const budgetLabel =
    project.budgetCents != null ? formatUSD(project.budgetCents) : null;

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

      <nav className="relative flex items-center gap-2 font-mono text-[10px] uppercase tracking-meta-hero text-ink-subtle">
        <Link href="/admin/projects" className="hover:text-ink">
          Projects
        </Link>
        <span className="text-copper">/</span>
        <span className="text-ink">{project.name}</span>
      </nav>

      <div className="relative mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="font-display text-3xl font-medium tracking-tight text-ink">
              {project.name}
            </h2>
            {budgetLabel ? (
              <span className="font-mono text-sm tabular-nums text-ink-muted">
                <span className="font-medium uppercase tracking-meta text-[10px] text-ink-subtle">
                  Budget
                </span>{' '}
                <span className="text-ink">{budgetLabel}</span>
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <ProjectStatusEditor
              projectId={project.id}
              status={project.status}
            />
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
      </div>
    </header>
  );
}
