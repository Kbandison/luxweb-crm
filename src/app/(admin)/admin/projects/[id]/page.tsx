import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getProjectDetail,
  getProjectMilestones,
  getProjectTimeLogs,
} from '@/lib/queries/admin';
import {
  MILESTONE_STATUS_LABEL,
  MILESTONE_STATUS_TONE,
} from '@/components/admin/projects/status-meta';
import { formatDate, formatHours } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, milestones, timeLogs] = await Promise.all([
    getProjectDetail(id),
    getProjectMilestones(id),
    getProjectTimeLogs(id),
  ]);
  if (!project) notFound();

  const totalHours = timeLogs.reduce((s, t) => s + t.hours, 0);
  const doneCount = milestones.filter((m) => m.status === 'done').length;
  const upcoming = milestones
    .filter((m) => m.status !== 'done' && m.dueDate)
    .sort(
      (a, b) =>
        new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime(),
    )
    .slice(0, 3);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-12 px-8 py-8">
      {/* Stats */}
      <section>
        <SectionHead number="01" title="At a glance" />
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Milestones"
            value={`${doneCount}/${milestones.length}`}
            hint={
              milestones.length === 0
                ? 'None set'
                : `${Math.round((doneCount / milestones.length) * 100)}% done`
            }
          />
          <Stat
            label="Hours logged"
            value={`${formatHours(totalHours, 1)}h`}
            hint={`${timeLogs.length} ${timeLogs.length === 1 ? 'entry' : 'entries'}`}
          />
          <Stat
            label="Days running"
            value={String(daysSince(project.createdAt))}
            hint={`Since ${formatDate(project.createdAt)}`}
          />
        </div>
      </section>

      {/* Upcoming milestones */}
      <section>
        <SectionHead
          number="02"
          title="Upcoming milestones"
          right={
            <Link
              href={`/admin/projects/${project.id}/milestones`}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper hover:underline"
            >
              View all →
            </Link>
          }
        />
        {upcoming.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
            <p className="font-sans text-sm text-ink-muted">
              {milestones.length === 0
                ? 'No milestones — add the first one in the Milestones tab.'
                : 'Nothing coming up. All known milestones are done or have no due date.'}
            </p>
          </div>
        ) : (
          <ul className="mt-5 space-y-2">
            {upcoming.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-sm font-medium text-ink">
                    {m.title}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
                    Due {formatDate(m.dueDate!)}
                  </p>
                </div>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]',
                    MILESTONE_STATUS_TONE[m.status],
                  )}
                >
                  {MILESTONE_STATUS_LABEL[m.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent time */}
      <section>
        <SectionHead
          number="03"
          title="Recent time"
          right={
            <Link
              href={`/admin/projects/${project.id}/time`}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper hover:underline"
            >
              View all →
            </Link>
          }
        />
        {timeLogs.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
            <p className="font-sans text-sm text-ink-muted">
              No time logged. Use the Time tab to log hours.
            </p>
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-xl border border-border bg-surface">
            <ul className="divide-y divide-border">
              {timeLogs.slice(0, 5).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-base font-medium tabular-nums text-ink">
                      {formatHours(t.hours)}h
                    </span>
                    <span className="font-mono text-xs tabular-nums text-ink-muted">
                      {formatDate(t.logDate)}
                    </span>
                    {t.note ? (
                      <span className="font-sans text-sm text-ink-muted">
                        — {t.note}
                      </span>
                    ) : null}
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
                    {t.createdByEmail ?? 'system'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}

function SectionHead({
  number,
  title,
  right,
}: {
  number: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-lg font-semibold tabular-nums text-copper">
          {number}
        </span>
        <span aria-hidden className="h-3.5 w-px bg-copper/40" />
        <h3 className="font-display text-lg font-medium tracking-tight text-ink">
          {title}
        </h3>
      </div>
      {right}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
        {label}
      </p>
      <p className="mt-3 font-mono text-3xl font-medium tabular-nums tracking-tight text-ink">
        {value}
      </p>
      {hint ? (
        <p className="mt-1.5 font-sans text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
