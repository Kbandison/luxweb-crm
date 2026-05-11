'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SuccessModal } from '@/components/ui/success-modal';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/formatters';
import {
  REVISION_STATUSES,
  REVISION_STATUS_LABEL,
  REVISION_STATUS_TONE,
  isApprovalStatus,
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
  const toast = useToast();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [requestingChanges, setRequestingChanges] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);

  const isMilestoneReview = isApprovalStatus(revision.status);
  const clientPendingReview =
    viewerRole === 'client' && revision.status === 'pending_review';
  const adminCanReopen =
    viewerRole === 'admin' && revision.status === 'changes_requested';
  const [reopenBusy, setReopenBusy] = useState(false);

  async function approve() {
    setApproveBusy(true);
    try {
      const res = await fetch(`/api/client/revisions/${revision.id}/approve`, {
        method: 'POST',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error("Couldn't approve", j.error ?? 'Approve failed.');
        return;
      }
      setApproveOpen(true);
    } finally {
      setApproveBusy(false);
    }
  }

  async function requestChanges(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/client/revisions/${revision.id}/request-changes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: reply.trim() }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = j.error ?? 'Failed to send.';
        setError(msg);
        toast.error("Couldn't send feedback", msg);
        return;
      }
      setReply('');
      setRequestingChanges(false);
      toast.success(
        'Changes requested',
        'The team has been notified and will iterate.',
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

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
        const msg = j.error ?? 'Failed to post';
        setError(msg);
        toast.error("Couldn't post reply", msg);
        return;
      }
      setReply('');
      toast.success('Reply posted');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Admin notifies client that the revision is ready for another look.
   * Posts the textarea body as a comment in the same call, flips the
   * revision changes_requested → pending_review, pings the client.
   * Same thread, no new revision_request row.
   */
  async function reopenForClient() {
    setReopenBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/revisions/${revision.id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reply.trim() ? { body: reply.trim() } : {}),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const msg = j.error ?? 'Failed to notify client.';
        setError(msg);
        toast.error("Couldn't notify client", msg);
        return;
      }
      setReply('');
      toast.success(
        'Client notified',
        'They can review the milestone again from their portal.',
      );
      router.refresh();
    } finally {
      setReopenBusy(false);
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
        const msg = j.error ?? 'Failed to update';
        setError(msg);
        toast.error("Couldn't update status", msg);
        return;
      }
      toast.success('Status updated');
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

        {clientPendingReview ? (
          <div className="space-y-3 rounded-xl border border-copper/30 bg-copper-soft/25 p-4">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-copper">
              Your turn — review &amp; respond
            </p>
            <p className="font-sans text-sm text-ink-muted">
              Approve to mark this milestone done and unlock the next one.
              Or request changes with feedback if something needs work.
            </p>
            {requestingChanges ? (
              <form onSubmit={requestChanges} className="space-y-3">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={4}
                  maxLength={10000}
                  required
                  placeholder="What needs to change? Be specific so the team can iterate quickly."
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 font-sans text-sm text-ink"
                />
                {error ? (
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRequestingChanges(false);
                      setReply('');
                      setError(null);
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy || !reply.trim()}
                  >
                    {busy ? 'Sending…' : 'Send feedback'}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={approve}
                  disabled={approveBusy}
                >
                  {approveBusy ? 'Approving…' : 'Approve milestone'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setRequestingChanges(true)}
                >
                  Request changes
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {viewerRole === 'admin' && !isMilestoneReview ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
              Set status:
            </span>
            {REVISION_STATUSES.filter(
              (s) => s !== revision.status && !isApprovalStatus(s),
            ).map((s) => (
              <Button
                key={s}
                variant="ghost"
                size="sm"
                onClick={() => changeStatus(s)}
                disabled={statusBusy}
              >
                {REVISION_STATUS_LABEL[s]}
              </Button>
            ))}
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

      {/* Reply box — gated:
            - approved → closed
            - resolved / wont_do → closed (legacy)
            - pending_review (client side) → handled by the approve panel above
            - everything else → free-form replies (admin during changes_requested,
              ongoing legacy thread, etc.) */}
      {revision.status === 'approved' ||
      revision.status === 'resolved' ||
      revision.status === 'wont_do' ? (
        <p className="rounded-md bg-ink/5 px-3 py-2 text-center font-sans text-xs text-ink-muted">
          {revision.status === 'approved'
            ? 'Approved. Milestone is done.'
            : 'This request is closed.'}
          {viewerRole === 'admin' && revision.status !== 'approved'
            ? ' Re-open it above to continue the thread.'
            : ''}
        </p>
      ) : clientPendingReview ? null : (
        <form
          onSubmit={submitComment}
          className="space-y-3 rounded-2xl border border-border bg-surface p-4"
        >
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            maxLength={10000}
            placeholder={
              adminCanReopen
                ? 'Reply to the feedback, or pair a note with "Ready for re-review"…'
                : 'Add a reply…'
            }
            className="w-full rounded-md border border-border bg-bg px-3 py-2 font-sans text-sm text-ink"
          />
          {error ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {adminCanReopen ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={reopenForClient}
                disabled={reopenBusy || busy}
                title="Flip the review back to the client; sends your note (if any) as a comment too."
              >
                {reopenBusy ? 'Notifying…' : 'Ready for re-review'}
              </Button>
            ) : null}
            <Button type="submit" size="sm" disabled={busy || !reply.trim()}>
              {busy ? 'Posting…' : 'Reply'}
            </Button>
          </div>
        </form>
      )}

      <SuccessModal
        open={approveOpen}
        title="Milestone approved"
        description={
          <>
            Thanks — that milestone is locked in as done. The next one
            unlocks for the team automatically.
          </>
        }
        primaryLabel="Got it"
        onPrimary={() => {
          setApproveOpen(false);
          router.refresh();
        }}
        onClose={() => {
          setApproveOpen(false);
          router.refresh();
        }}
      />
    </article>
  );
}
