import Link from 'next/link';
import { Topbar } from '@/components/admin/topbar';
import { getAllOpenRevisions } from '@/lib/queries/admin';
import {
  REVISION_STATUS_LABEL,
  REVISION_STATUS_TONE,
} from '@/lib/types/revision';
import { formatRelative } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export default async function AdminRevisionsQueuePage() {
  const revisions = await getAllOpenRevisions();

  return (
    <>
      <Topbar title="Revisions" />
      <main className="mx-auto w-full max-w-6xl space-y-6 px-8 py-8">
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-medium text-ink">
            Open revision requests
          </h1>
          <p className="font-sans text-sm text-ink-muted">
            Client change requests across all projects. Resolved and
            won&apos;t-do items aren&apos;t shown here.
          </p>
        </header>

        {revisions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
            <p className="font-display text-lg font-medium text-ink">
              Queue is clear
            </p>
            <p className="mx-auto mt-2 max-w-md font-sans text-sm text-ink-muted">
              Nothing open right now. New requests from clients show up here
              first.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <ul className="divide-y divide-border">
              {revisions.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/projects/${r.projectId}/revisions/${r.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-sans text-sm font-medium text-ink">
                        {r.title}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                        {r.projectName} · {r.contactName}
                        {r.milestoneTitle ? ` · ${r.milestoneTitle}` : ''}{' '}
                        · Opened {formatRelative(r.createdAt)}
                        {r.commentCount > 0
                          ? ` · ${r.commentCount} ${r.commentCount === 1 ? 'reply' : 'replies'}`
                          : ''}
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
          </div>
        )}
      </main>
    </>
  );
}
