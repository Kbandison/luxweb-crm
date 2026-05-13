import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientProjectRevisions } from '@/lib/queries/client';
import {
  REVISION_STATUS_LABEL,
  REVISION_STATUS_TONE,
} from '@/lib/types/revision';
import { StatusPill } from '@/components/ui/status-pill';
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

  const revisions = await getClientProjectRevisions(id, session.userId);
  if (revisions === null) notFound();

  // Surface "needs your action" reviews up top.
  const pending = revisions.filter((r) => r.status === 'pending_review');
  const rest = revisions.filter((r) => r.status !== 'pending_review');

  return (
    <main className="space-y-6 px-6 py-10 md:px-10">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-medium text-ink">
          Milestone reviews
        </h1>
        <p className="font-sans text-sm text-ink-muted">
          Each time the LuxWeb team finishes a milestone, you&apos;ll get a
          review request here. Approve to advance the project, or request
          changes with feedback. The team is notified either way.
        </p>
      </header>

      {revisions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
          <p className="font-display text-lg font-medium text-ink">
            No reviews yet
          </p>
          <p className="mx-auto mt-2 max-w-md font-sans text-sm text-ink-muted">
            When the team submits a milestone for your review, it shows up
            here. You&apos;ll also get an email and a notification.
          </p>
        </div>
      ) : (
        <>
          {pending.length > 0 ? (
            <section className="space-y-2">
              <p className="font-mono text-[10px] font-medium uppercase tracking-meta text-copper">
                Awaiting your review · {pending.length}
              </p>
              <ul className="overflow-hidden rounded-xl border border-copper/30 bg-copper-soft/15">
                {pending.map((r, i) => (
                  <li
                    key={r.id}
                    className={cn(i > 0 && 'border-t border-copper/30')}
                  >
                    <Link
                      href={`/portal/project/${id}/revisions/${r.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-copper-soft/30"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-sans text-sm font-medium text-ink">
                          {r.title}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-meta-tight text-ink-subtle">
                          {r.milestoneTitle ? `${r.milestoneTitle} · ` : ''}
                          Submitted {formatRelative(r.createdAt)}
                        </p>
                      </div>
                      <StatusPill
                        label={REVISION_STATUS_LABEL[r.status]}
                        tone={REVISION_STATUS_TONE[r.status]}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section className="space-y-2">
              <p className="font-mono text-[10px] font-medium uppercase tracking-meta text-ink-muted">
                Resolved · {rest.length}
              </p>
              <ul className="overflow-hidden rounded-xl border border-border bg-surface">
                {rest.map((r, i) => (
                  <li
                    key={r.id}
                    className={cn(i > 0 && 'border-t border-border')}
                  >
                    <Link
                      href={`/portal/project/${id}/revisions/${r.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-sans text-sm font-medium text-ink">
                          {r.title}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-meta-tight text-ink-subtle">
                          {r.milestoneTitle ? `${r.milestoneTitle} · ` : ''}
                          Opened {formatRelative(r.createdAt)}
                          {r.commentCount > 0
                            ? ` · ${r.commentCount} ${r.commentCount === 1 ? 'reply' : 'replies'}`
                            : ''}
                        </p>
                      </div>
                      <StatusPill
                        label={REVISION_STATUS_LABEL[r.status]}
                        tone={REVISION_STATUS_TONE[r.status]}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
