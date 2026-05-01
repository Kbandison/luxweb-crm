'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StarInput, StarDisplay } from '@/components/reviews/star-input';
import { formatDateLong } from '@/lib/formatters';

export type AdminReviewCardProps = {
  projectId: string;
  review: {
    clientRating: number | null;
    clientReview: string | null;
    clientConsentToPublish: boolean;
    clientSubmittedAt: string | null;
    adminRating: number | null;
    adminNotes: string | null;
    adminSubmittedAt: string | null;
  } | null;
};

export function AdminReviewCard({ projectId, review }: AdminReviewCardProps) {
  return (
    <div className="space-y-4">
      <ClientReviewBlock review={review} />
      <AdminPrivateBlock projectId={projectId} review={review} />
    </div>
  );
}

function ClientReviewBlock({ review }: { review: AdminReviewCardProps['review'] }) {
  if (!review?.clientSubmittedAt) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
          Client review
        </p>
        <p className="mt-2 font-sans text-sm text-ink-muted">
          The client hasn&apos;t submitted a review yet. They&apos;ll be
          prompted on their project page once the project is marked
          completed.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
          Client review
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
          {formatDateLong(review.clientSubmittedAt)}
        </p>
      </div>
      {review.clientRating ? (
        <div className="mt-3">
          <StarDisplay value={review.clientRating} size="md" />
        </div>
      ) : null}
      {review.clientReview ? (
        <blockquote className="mt-3 border-l-2 border-copper pl-4 font-sans text-sm italic text-ink">
          “{review.clientReview}”
        </blockquote>
      ) : null}
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em]">
        {review.clientConsentToPublish ? (
          <span className="rounded bg-success/15 px-1.5 py-0.5 text-success">
            Consent to publish
          </span>
        ) : (
          <span className="rounded bg-ink/5 px-1.5 py-0.5 text-ink-muted">
            Private
          </span>
        )}
      </p>
    </div>
  );
}

function AdminPrivateBlock({
  projectId,
  review,
}: {
  projectId: string;
  review: AdminReviewCardProps['review'];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(review?.adminRating ?? 0);
  const [notes, setNotes] = useState(review?.adminNotes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasReview = !!review?.adminSubmittedAt;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setError('Pick a rating.');
      return;
    }
    if (!notes.trim()) {
      setError('Add a note.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, notes: notes.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Failed to save');
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="rounded-2xl border border-border bg-surface-2/40 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
            Internal review (private)
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper hover:underline"
          >
            {hasReview ? 'Edit' : 'Add'}
          </button>
        </div>
        {hasReview ? (
          <>
            {review.adminRating ? (
              <div className="mt-3">
                <StarDisplay value={review.adminRating} size="md" />
              </div>
            ) : null}
            {review.adminNotes ? (
              <p className="mt-3 whitespace-pre-wrap font-sans text-sm text-ink">
                {review.adminNotes}
              </p>
            ) : null}
            {review.adminSubmittedAt ? (
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
                {formatDateLong(review.adminSubmittedAt)}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-2 font-sans text-sm text-ink-muted">
            Capture your take on the client. Never visible to them.
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-border bg-surface-2/40 p-5"
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
          Internal review (private)
        </p>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={busy}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-copper"
        >
          ← Cancel
        </button>
      </div>

      <div className="space-y-2">
        <Label>Rating</Label>
        <StarInput value={rating} onChange={setRating} disabled={busy} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="admin_notes">Notes</Label>
        <textarea
          id="admin_notes"
          required
          rows={4}
          maxLength={5000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Easy to work with? Scope creep? Pay on time?"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 font-sans text-sm text-ink"
        />
      </div>

      {error ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
