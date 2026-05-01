'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StarInput, StarDisplay } from '@/components/reviews/star-input';
import { formatDateLong } from '@/lib/formatters';

export type ClientReviewCardProps = {
  projectId: string;
  review: {
    clientRating: number | null;
    clientReview: string | null;
    clientConsentToPublish: boolean;
    clientSubmittedAt: string | null;
  } | null;
};

export function ClientReviewCard({
  projectId,
  review,
}: ClientReviewCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already submitted — show the read-only display.
  if (review?.clientSubmittedAt) {
    return (
      <section className="space-y-3 rounded-2xl border border-success/30 bg-success/5 p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-success">
            Review submitted
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
            {formatDateLong(review.clientSubmittedAt)}
          </p>
        </div>
        {review.clientRating ? (
          <StarDisplay value={review.clientRating} size="md" />
        ) : null}
        {review.clientReview ? (
          <blockquote className="border-l-2 border-copper pl-4 font-sans text-sm italic text-ink">
            “{review.clientReview}”
          </blockquote>
        ) : null}
        <p className="font-sans text-xs text-ink-muted">
          Thank you for the feedback.
          {review.clientConsentToPublish
            ? ' You allowed LuxWeb to feature this on the website.'
            : ' This review is private.'}
        </p>
      </section>
    );
  }

  if (!open) {
    return (
      <section className="space-y-3 rounded-2xl border border-copper/30 bg-copper-soft/30 p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-copper">
          Project complete — would you leave a review?
        </p>
        <p className="font-sans text-sm text-ink-muted">
          Quick rating and a few words on how it went. Optional: let us share
          it as a testimonial.
        </p>
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)}>Leave a review</Button>
        </div>
      </section>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setError('Please pick a rating from 1 to 5.');
      return;
    }
    if (!body.trim()) {
      setError('Please write a few words.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/client/projects/${projectId}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rating,
            review: body.trim(),
            consent_to_publish: consent,
          }),
        },
      );
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Failed to submit');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-2xl border border-copper/30 bg-copper-soft/30 p-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-medium text-ink">
          Leave a review
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-copper"
        >
          ← Cancel
        </button>
      </div>

      <div className="space-y-2">
        <Label>Rating</Label>
        <StarInput value={rating} onChange={setRating} size="lg" disabled={busy} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rev_body">Your feedback</Label>
        <textarea
          id="rev_body"
          required
          rows={5}
          maxLength={5000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What worked well? What could've been better?"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 font-sans text-sm text-ink"
        />
      </div>

      <label className="flex items-start gap-3 rounded-lg bg-surface-2/60 px-3 py-2.5">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border accent-copper"
        />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-sm font-medium text-ink">
            Allow LuxWeb to feature this review
          </p>
          <p className="mt-0.5 font-sans text-xs text-ink-muted">
            Your name and rating may appear on the LuxWeb website. Leave
            unchecked to keep it private.
          </p>
        </div>
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 font-sans text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit review'}
        </Button>
      </div>
    </form>
  );
}
