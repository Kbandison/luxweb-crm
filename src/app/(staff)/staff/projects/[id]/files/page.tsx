import { getProjectFiles } from '@/lib/queries/admin';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/formatters';

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export default async function StaffProjectFilesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const files = await getProjectFiles(id);

  if (files.length === 0) {
    return (
      <EmptyState
        title="No files yet"
        description="Project files uploaded by the studio or client will appear here."
      />
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {files.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate font-sans text-sm font-medium text-ink">{f.fileName}</p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
              {formatBytes(f.sizeBytes)} · {formatDate(f.createdAt)}
            </p>
          </div>
          <a
            href={`/api/staff/files/${f.id}/download`}
            className="shrink-0 rounded-md border border-border bg-surface px-3 py-1.5 font-sans text-xs font-medium text-ink transition-colors hover:border-border-strong hover:bg-surface-2"
          >
            Download
          </a>
        </li>
      ))}
    </ul>
  );
}
