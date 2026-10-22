import Link from 'next/link';
import { Topbar } from '@/components/admin/topbar';
import { getContactChoices, getGoogleReviews } from '@/lib/queries/google-reviews';
import { GOOGLE_REVIEW_URL } from '@/lib/google-reviews/rules';
import { StarDisplay } from '@/components/reviews/star-input';
import { GoogleReviewControls } from '@/components/admin/reviews/google-review-controls';
import { StatCard } from '@/components/ui/stat-card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHead } from '@/components/ui/section-head';
import { formatDateLong } from '@/lib/formatters';
import { cn } from '@/lib/utils';

const TAG = 'rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-meta-tight';

export default async function AdminReviewsPage() {
  const [reviews, contacts] = await Promise.all([getGoogleReviews(), getContactChoices()]);

  const live = reviews.filter((r) => !r.removedAt);
  const onSite = live.filter((r) => r.onSite);
  const unlinked = live.filter((r) => !r.contactId);
  const average =
    live.length > 0 ? live.reduce((s, r) => s + r.rating, 0) / live.length : 0;

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-6xl space-y-6 px-8 py-8">
        <PageHeader
          eyebrow="Workspace"
          title="Reviews"
          description="Your Google reviews, copied in once a day. Clients review you on Google; here you link each one to its client and choose what shows on luxwebstudio.dev."
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Google reviews"
            value={String(live.length)}
            hint={live.length > 0 ? `Avg ${average.toFixed(1)} ★` : 'None yet'}
            size="lg"
          />
          <StatCard
            label="On the site"
            value={String(onSite.length)}
            hint="Shown on luxwebstudio.dev"
            size="lg"
          />
          <StatCard
            label="Not linked"
            value={String(unlinked.length)}
            hint="Pick the client below"
            tone={unlinked.length > 0 ? 'warning' : 'default'}
            size="lg"
          />
        </div>

        <p className="font-sans text-sm text-ink-muted">
          Review link for clients:{' '}
          <a
            href={GOOGLE_REVIEW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-copper hover:underline"
          >
            {GOOGLE_REVIEW_URL}
          </a>
        </p>

        <SectionHead
          title="From Google"
          description={reviews.length === 1 ? '1 review' : `${reviews.length} reviews`}
        />

        {reviews.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
            <p className="font-display text-lg font-medium text-ink">No Google reviews yet</p>
            <p className="mx-auto mt-2 max-w-md font-sans text-sm text-ink-muted">
              Clients get asked on their portal once a project is completed, and by
              email after launch. A new review shows up here within a day.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <article
                key={r.id}
                className={cn(
                  'space-y-4 rounded-xl border border-border bg-surface p-5',
                  r.removedAt && 'opacity-60',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-sm font-medium text-ink">{r.reviewerName}</p>
                    <p className="mt-0.5 font-mono text-[11px] uppercase tracking-meta-tight text-ink-subtle">
                      {formatDateLong(r.reviewedAt)}
                      {r.contactId ? (
                        <>
                          {' · '}
                          <Link href={`/admin/clients/${r.contactId}`} className="text-copper hover:underline">
                            {r.contactName}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.removedAt ? (
                      <span className={cn(TAG, 'bg-danger/10 text-danger')}>Gone from Google</span>
                    ) : r.onSite ? (
                      <span className={cn(TAG, 'bg-success/15 text-success')}>On the site</span>
                    ) : (
                      <span className={cn(TAG, 'bg-ink/5 text-ink-muted')}>Not on the site</span>
                    )}
                    <span
                      className={cn(
                        TAG,
                        r.replied ? 'bg-ink/5 text-ink-muted' : 'bg-copper/15 text-copper',
                      )}
                    >
                      {r.replied ? 'Replied' : 'No reply yet'}
                    </span>
                  </div>
                </div>

                <StarDisplay value={r.rating} size="sm" />

                {r.body ? (
                  <blockquote
                    className={cn(
                      'border-l-2 pl-4 font-sans text-sm italic text-ink',
                      r.onSite ? 'border-success' : 'border-copper',
                    )}
                  >
                    “{r.body}”
                  </blockquote>
                ) : (
                  <p className="font-sans text-sm text-ink-muted">Stars only, no written review.</p>
                )}

                <GoogleReviewControls
                  reviewId={r.id}
                  showOnSite={r.showOnSite}
                  contactId={r.contactId}
                  contacts={contacts}
                />
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
