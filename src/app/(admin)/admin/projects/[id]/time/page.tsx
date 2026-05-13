import { requireAdmin } from '@/lib/auth/guards';
import {
  getProjectTimeLogs,
  getRunningTimerForUser,
} from '@/lib/queries/admin';
import { TimeLogsList } from '@/components/admin/projects/time-logs-list';
import { TimerStrip } from '@/components/admin/projects/timer-strip';

export default async function ProjectTimeLogsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAdmin();
  const [logs, running] = await Promise.all([
    getProjectTimeLogs(id),
    getRunningTimerForUser(session.userId),
  ]);

  // Tool tab — no max-width per workspace rule (files/milestones/time/messages/invoices).
  return (
    <main className="w-full space-y-6 px-8 py-8">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-medium text-ink">
          Time tracking
        </h1>
        <p className="font-sans text-sm text-ink-muted">
          Start a timer while you work, or log entries manually. Hours roll up
          into the project&apos;s profitability calculation.
        </p>
      </header>
      <TimerStrip projectId={id} running={running} />
      <TimeLogsList projectId={id} initial={logs} />
    </main>
  );
}
