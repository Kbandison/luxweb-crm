import { getProjectTimeLogs } from '@/lib/queries/admin';
import { TimeLogsList } from '@/components/admin/projects/time-logs-list';

export default async function ProjectTimeLogsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const logs = await getProjectTimeLogs(id);

  return (
    <main className="mx-auto w-full max-w-5xl px-8 py-8">
      <TimeLogsList projectId={id} initial={logs} />
    </main>
  );
}
