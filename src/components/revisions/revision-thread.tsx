'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/formatters';
import {
  REVISION_STATUSES,
  REVISION_STATUS_LABEL,
  REVISION_STATUS_TONE,
  type RevisionStatus,
} from '@/lib/types/revision';
import { cn } from '@/lib/utils';

export type RevisionThreadProps = {
  revision: {
    id: string;
    title: string;
    body: string;
    status: RevisionStatus;
    milestoneTitle: string | null;
    createdAt: string;
    resolvedAt: string | null;
  };
  comments: Array<{
    id: string;
    body: string;
    authorName: string;
    authorRole: 'admin' | 'client';
    createdAt: string;
  }>;
  /** 'admin' shows status controls; 'client' just sees the badge. */
  viewerRole: 'admin' | 'client';
};

export function RevisionThread({
  revision,
  comments,
  viewerRole,
}: RevisionThreadProps) {
  const router = useRouter();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const path =
        viewerRole === 'admin'
          ? `/api/admin/revisions/${revision.id}/comments`
          : `/api/client/revisions/${revision.id}/comments`;
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Failed to post');
        return;
      }
      setReply('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(next: RevisionStatus) {
    setStatusBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/revisions/${revision.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Failed to update');
        return;
      }
      router.refresh();
    } finally {
      setStatusBusy(false);
    }
  }

  return (
    <article className="space-y-6">
      <header className="space-y-3 rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-copper">
              Revision request
            </p>
            <h1 className="mt-1 font-display text-2xl font-medium text-ink">
              {revision.title}
            </h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
              {revision.milestoneTitle
                ? `Milestone · ${revision.milestoneTitle} · `
                : ''}
              Opened {formatDateTime(revision.createdAt)}
              {revision.resolvedAt
                ? ` · Resolved ${formatDateTime(revision.resolvedAt)}`
                : ''}
            </p>
          </div>
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em]',
              REVISION_STATUS_TONE[revision.status],
            )}
          >
            {REVISION_STATUS_LABEL[revision.status]}
          </span>
        </div>
        <p className="whitespace-pre-wrap font-sans text-sm text-ink">
          {revision.body}
        </p>

        {viewerRole === 'admin' ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
              Set status:
            </span>
            {REVISION_STATUSES.filter((s) => s !== revision.status).map(
              (s) => (
                <Button
                  key={s}
                  variant="ghost"
                  size="sm"
                  onClick={() => changeStatus(s)}
                  disabled={statusBusy}
                >
                  {REVISION_STATUS_LABEL[s]}
                </Button>
              ),
            )}
          </div>
        ) : null}
      </header>

      {/* Comments */}
      <section className="space-y-3">
        {comments.length === 0 ? (
          <p className="text-center font-sans text-sm text-ink-subtle">
            No replies yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li
                key={c.id}
                className={cn(
                  'rounded-xl border bg-surface p-4',
                  c.authorRole === 'admin'
                    ? 'border-copper/20 bg-copper-soft/20'
                    : 'border-border',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-sans text-sm font-medium text-ink">
                    {c.authorName}
                    <span className="ml-2 rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-muted">
                      {c.authorRole}
                    </span>
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
                    {formatDateTime(c.createdAt)}
                  </p>
                </div>
                <p className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Reply box — disabled when terminal */}
      {revision.status === 'resolved' || revision.status === 'wont_do' ? (
        <p className="rounded-md bg-ink/5 px-3 py-2 text-center font-sans text-xs text-ink-muted">
          This request is closed.
          {viewerRole === 'admin'
            ? ' Re-open it above to continue the thread.'
            : ''}
        </p>
      ) : (
        <form
          onSubmit={submitComment}
          className="space-y-3 rounded-2xl border border-border bg-surface p-4"
        >
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            maxLength={10000}
            placeholder="Add a reply…"
            className="w-full rounded-md border border-border bg-bg px-3 py-2 font-sans text-sm text-ink"
          />
          {error ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={busy || !reply.trim()}>
              {busy ? 'Posting…' : 'Reply'}
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}
