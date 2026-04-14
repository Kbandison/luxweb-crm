import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientProject } from '@/lib/queries/client';
import { formatDate } from '@/lib/formatters';
import {
  MILESTONE_STATUS_LABEL as MILESTONE_LABEL,
  MILESTONE_STATUS_TONE as MILESTONE_TONE,
} from '@/components/admin/projects/status-meta';
import { cn } from '@/lib/utils';

export default async function ClientProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');
  const project = await getClientProject(id, session.userId);
  if (!project) notFound();

  const done = project.milestones.filter((m) => m.status === 'done').length;
  const total = project.milestones.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <main className="space-y-10 px-6 py-10 md:px-10">
      {/* Progress summary */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
              Milestone progress
            </p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-4xl font-medium tabular-nums text-ink">
                {done}
              </span>
              <span className="font-mono text-xl tabular-nums text-ink-subtle">
                / {total}
              </span>
            </div>
          </div>
          <span className="font-mono text-sm tabular-nums text-ink-muted">
            {pct}%
          </span>
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-copper transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </section>

      {/* Milestones */}
      <section>
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-semibold tabular-nums text-copper">
            01
          </span>
          <span aria-hidden className="h-3.5 w-px bg-copper/40" />
          <h2 className="font-display text-lg font-medium tracking-tight text-ink">
            Milestones
          </h2>
        </div>

        {project.milestones.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
            <p className="font-sans text-sm text-ink-muted">
              No visible milestones. The team will add them as the work
              takes shape.
            </p>
          </div>
        ) : (
          <ol className="mt-5 space-y-2">
            {project.milestones.map((m, i) => (
              <li
                key={m.id}
                className={cn(
                  'flex items-start gap-4 rounded-xl border border-border bg-surface p-4',
                  m.status === 'done' && 'opacity-80',
                )}
              >
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-mono text-[11px] tabular-nums text-ink-subtle">
                  {(i + 1).toString().padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h4
                      className={cn(
                        'font-sans text-sm font-medium text-ink',
                        m.status === 'done' && 'line-through decoration-ink-subtle',
                      )}
                    >
                      {m.title}
                    </h4>
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]',
                        MILESTONE_TONE[m.status],
                      )}
                    >
                      {MILESTONE_LABEL[m.status]}
                    </span>
                  </div>
                  {m.description ? (
                    <p className="mt-1 whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink-muted">
                      {m.description}
                    </p>
                  ) : null}
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
                    {m.dueDate ? `Due ${formatDate(m.dueDate)}` : 'No due date'}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
