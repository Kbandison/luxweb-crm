import Link from 'next/link';
import { Topbar } from '@/components/admin/topbar';
import { getAllProjectReviews } from '@/lib/queries/admin';
import { StarDisplay } from '@/components/reviews/star-input';
import { formatDateLong } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export default async function AdminReviewsPage() {
  const all = await getAllProjectReviews();

  // Buckets: completed client reviews vs. waiting on client.
  const submitted = all.filter((r) => !!r.clientSubmittedAt);
  const publishable = submitted.filter((r) => r.clientConsentToPublish);

  const avgClient =
    submitted.length > 0
      ? submitted.reduce((s, r) => s + (r.clientRating ?? 0), 0) /
        submitted.length
      : 0;

  return (
    <>
      <Topbar title="Reviews" />
      <main className="mx-auto w-full max-w-6xl space-y-6 px-8 py-8">
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-medium text-ink">
            Reviews
          </h1>
          <p className="font-sans text-sm text-ink-muted">
            Client testimonials and your private take on each project.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Client reviews"
            value={String(submitted.length)}
            hint={
              submitted.length > 0
                ? `Avg ${avgClient.toFixed(1)} ★`
                : 'None yet'
            }
          />
          <Stat
            label="Publishable"
            value={String(publishable.length)}
            hint="Client opted in to share"
          />
          <Stat label="All projects" value={String(all.length)} />
        </div>

        {all.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
            <p className="font-display text-lg font-medium text-ink">
              No reviews yet
            </p>
            <p className="mx-auto mt-2 max-w-md font-sans text-sm text-ink-muted">
              Once a project is marked completed, the client gets prompted to
              leave a review on their portal.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {all.map((r) => (
              <Link
                key={r.projectId}
                href={`/admin/projects/${r.projectId}`}
                className="block rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-surface-2/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-sm font-medium text-ink">
                      {r.projectName}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                      {r.contactName}
                      {r.clientSubmittedAt
                        ? ` · ${formatDateLong(r.clientSubmittedAt)}`
                        : ' · Waiting on client'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.clientConsentToPublish ? (
                      <span className="rounded bg-success/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-success">
                        Publishable
                      </span>
                    ) : null}
                    {r.adminRating ? (
                      <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-muted">
                        Internal logged
                      </span>
                    ) : null}
                  </div>
                </div>

                {r.clientRating ? (
                  <div className="mt-3">
                    <StarDisplay value={r.clientRating} size="sm" />
                  </div>
                ) : null}

                {r.clientReview ? (
                  <blockquote
                    className={cn(
                      'mt-3 line-clamp-3 border-l-2 pl-4 font-sans text-sm italic text-ink',
                      r.clientConsentToPublish
                        ? 'border-success'
                        : 'border-copper',
                    )}
                  >
                    “{r.clientReview}”
                  </blockquote>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
        {label}
      </p>
      <p className="mt-3 font-mono text-3xl font-medium tabular-nums tracking-tight text-ink">
        {value}
      </p>
      {hint ? (
        <p className="mt-1.5 font-sans text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
