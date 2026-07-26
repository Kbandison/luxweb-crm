import { requireAssignedProjectPage } from '@/lib/staff/access';
import { getRunningTimerForUser } from '@/lib/queries/admin';
import { getStaffProjectTimeLogs } from '@/lib/queries/staff';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHead } from '@/components/ui/section-head';
import { TimerWidget } from '@/components/staff/timer-widget';
import { formatDate } from '@/lib/formatters';

export default async function StaffProjectTimePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, teamMemberId } = await requireAssignedProjectPage(id);

  const [running, { logs, totalHours }] = await Promise.all([
    getRunningTimerForUser(userId),
    getStaffProjectTimeLogs(teamMemberId, id),
  ]);

  return (
    <div className="space-y-8">
      <TimerWidget projectId={id} running={running} />

      <section className="space-y-4">
        <SectionHead
          number="01"
          title="Your time"
          description="Hours you've logged on this project."
          right={
            <span className="font-mono text-sm tabular-nums text-ink-muted">
              {totalHours.toFixed(2)} h total
            </span>
          }
        />
        {logs.length === 0 ? (
          <EmptyState
            title="No time logged yet"
            description="Start the timer above, or it'll fill in as you work."
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm tabular-nums text-ink">
                    {l.hours.toFixed(2)} h
                  </p>
                  {l.note ? (
                    <p className="mt-0.5 truncate font-sans text-xs text-ink-muted">
                      {l.note}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                  {formatDate(l.logDate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
