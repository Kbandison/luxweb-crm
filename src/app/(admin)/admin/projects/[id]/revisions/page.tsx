import Link from 'next/link';
import { getProjectRevisions } from '@/lib/queries/admin';
import {
  REVISION_STATUS_LABEL,
  REVISION_STATUS_TONE,
} from '@/lib/types/revision';
import { formatRelative } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export default async function AdminProjectRevisionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const revisions = await getProjectRevisions(id);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-8 py-8">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-medium text-ink">
          Revisions
        </h1>
        <p className="font-sans text-sm text-ink-muted">
          Client-initiated change requests for this project.
        </p>
      </header>

      {revisions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="font-display text-lg font-medium text-ink">
            No revisions for this project
          </p>
          <p className="mx-auto mt-2 max-w-md font-sans text-sm text-ink-muted">
            When the client opens a revision request from the portal,
            it&apos;ll appear here.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {revisions.map((r, i) => (
            <li key={r.id} className={cn(i > 0 && 'border-t border-border')}>
              <Link
                href={`/admin/projects/${id}/revisions/${r.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-sm font-medium text-ink">
                    {r.title}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                    Opened {formatRelative(r.createdAt)}
                  </p>
                </div>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]',
                    REVISION_STATUS_TONE[r.status],
                  )}
                >
                  {REVISION_STATUS_LABEL[r.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
