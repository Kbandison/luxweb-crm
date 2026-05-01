import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import {
  getClientProject,
  getClientProjectRevisions,
} from '@/lib/queries/client';
import { NewRevisionForm } from '@/components/client/revisions/new-revision-form';
import {
  REVISION_STATUS_LABEL,
  REVISION_STATUS_TONE,
} from '@/lib/types/revision';
import { formatRelative } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export default async function ClientProjectRevisionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  const [project, revisions] = await Promise.all([
    getClientProject(id, session.userId),
    getClientProjectRevisions(id, session.userId),
  ]);
  if (!project) notFound();
  if (revisions === null) notFound();

  return (
    <main className="space-y-6 px-6 py-10 md:px-10">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-medium text-ink">
          Revisions
        </h1>
        <p className="font-sans text-sm text-ink-muted">
          Request changes after delivery. Each request stays open until LuxWeb
          marks it resolved — you&apos;ll see the back-and-forth here.
        </p>
      </header>

      <NewRevisionForm
        projectId={id}
        milestones={project.milestones.map((m) => ({
          id: m.id,
          title: m.title,
        }))}
      />

      {revisions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
          <p className="font-display text-lg font-medium text-ink">
            No revision requests yet
          </p>
          <p className="mx-auto mt-2 max-w-md font-sans text-sm text-ink-muted">
            Use the button above to request changes. Be as specific as you can
            so the team can act quickly.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {revisions.map((r, i) => (
            <li key={r.id} className={cn(i > 0 && 'border-t border-border')}>
              <Link
                href={`/portal/project/${id}/revisions/${r.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-sm font-medium text-ink">
                    {r.title}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                    {r.milestoneTitle ? `${r.milestoneTitle} · ` : ''}
                    Opened {formatRelative(r.createdAt)}
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
      )}
    </main>
  );
}
