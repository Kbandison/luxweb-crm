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

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-8 py-8">
      <TimerStrip projectId={id} running={running} />
      <TimeLogsList projectId={id} initial={logs} />
    </main>
  );
}
