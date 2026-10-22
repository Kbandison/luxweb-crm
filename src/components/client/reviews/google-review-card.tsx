import { StarDisplay } from '@/components/reviews/star-input';
import { buttonVariants } from '@/components/ui/button';
import { GOOGLE_REVIEW_URL } from '@/lib/google-reviews/rules';
import type { GoogleReview } from '@/lib/queries/google-reviews';

/**
 * The review ask on a completed project. Every client gets the same Google
 * link, whatever they thought of the work: sending only happy clients to
 * Google is review gating, which Google's rules forbid.
 */
export function GoogleReviewCard({ review }: { review: GoogleReview | null }) {
  if (review) {
    return (
      <section className="space-y-3 rounded-2xl border border-success/30 bg-success/5 p-6">
        <p className="font-mono text-[10px] uppercase tracking-meta text-success">
          Thanks for your Google review
        </p>
        <StarDisplay value={review.rating} size="md" />
        <p className="font-sans text-sm text-ink-muted">
          It helps other business owners find us, and it means a lot to a small
          studio.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-copper/30 bg-copper-soft/30 p-6">
      <p className="font-mono text-[10px] uppercase tracking-meta text-copper">
        Project complete. Would you leave us a Google review?
      </p>
      <p className="font-sans text-sm text-ink-muted">
        An honest review on Google is the biggest help to a small studio like
        ours. It takes about a minute.
      </p>
      <div className="flex justify-end">
        <a
          href={GOOGLE_REVIEW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants()}
        >
          Leave a Google review
        </a>
      </div>
    </section>
  );
}
