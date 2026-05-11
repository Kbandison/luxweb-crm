import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/supabase/session';
import {
  getClientProject,
  getClientProjectCarePlan,
  getClientProjectReview,
  type ClientMilestone,
} from '@/lib/queries/client';
import { CarePlanCard } from '@/components/client/care-plan/care-plan-card';
import { CarePlanBillingHistory } from '@/components/care-plan/billing-history';
import { getCarePlanInvoiceHistory } from '@/lib/care-plan/billing-history';
import { ClientReviewCard } from '@/components/client/reviews/client-review-card';
import { formatDate } from '@/lib/formatters';
import {
  MILESTONE_STATUS_LABEL as MILESTONE_LABEL,
  MILESTONE_STATUS_TONE as MILESTONE_TONE,
} from '@/components/admin/projects/status-meta';
import { cn } from '@/lib/utils';

/**
 * Decide where a milestone row should link to.
 *   - unpaid invoice → straight to the pay page
 *   - awaiting client review → approval page
 *   - paid invoice → invoice detail (receipt)
 *   - otherwise nothing actionable yet
 */
function milestoneHref(
  projectId: string,
  m: ClientMilestone,
): { href: string; hint: string } | null {
  if (
    m.invoiceId &&
    m.invoiceStatus &&
    m.invoiceStatus !== 'paid' &&
    m.invoiceStatus !== 'void'
  ) {
    return {
      href: `/portal/project/${projectId}/invoices/${m.invoiceId}/pay`,
      hint: 'Pay now',
    };
  }
  if (m.status === 'in_progress' && m.revisionId) {
    return {
      href: `/portal/project/${projectId}/revisions/${m.revisionId}`,
      hint: 'Review',
    };
  }
  if (m.invoiceId && m.invoiceStatus === 'paid') {
    return {
      href: `/portal/project/${projectId}/invoices/${m.invoiceId}/pay`,
      hint: 'Receipt',
    };
  }
  return null;
}

export default async function ClientProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');
  const [project, carePlan, review] = await Promise.all([
    getClientProject(id, session.userId),
    getClientProjectCarePlan(id, session.userId),
    getClientProjectReview(id, session.userId),
  ]);
  if (!project) notFound();
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
  const billingHistory = carePlan
    ? await getCarePlanInvoiceHistory(carePlan.stripeSubscriptionId)
    : [];

  const done = project.milestones.filter((m) => m.status === 'done').length;
  const total = project.milestones.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <main className="space-y-10 px-6 py-10 md:px-10">
      {/* Progress summary */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
              Milestone progress
            </p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-4xl font-medium tabular-nums text-ink">
                {done}
              </span>
              <span className="font-mono text-xl tabular-nums text-ink-subtle">
                / {total}
              </span>
            </div>
          </div>
          <span className="font-mono text-sm tabular-nums text-ink-muted">
            {pct}%
          </span>
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-copper transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </section>

      {/* Review prompt / read-only review — only on completed projects */}
      {project.status === 'completed' ? (
        <ClientReviewCard projectId={id} review={review} />
      ) : null}

      {/* Care Plan — only show if enrolled or pending */}
      {carePlan && publishableKey ? (
        <div className="space-y-4">
          <CarePlanCard
            plan={{
              id: carePlan.id,
              amountCents: carePlan.amountCents,
              interval: carePlan.interval,
              status: carePlan.status,
              currentPeriodEnd: carePlan.currentPeriodEnd,
              cancelAtPeriodEnd: carePlan.cancelAtPeriodEnd,
              paymentMethodBrand: carePlan.paymentMethodBrand,
              paymentMethodLast4: carePlan.paymentMethodLast4,
              pendingClientSecret: carePlan.pendingClientSecret,
            }}
            publishableKey={publishableKey}
          />
          {billingHistory.length > 0 ? (
            <div className="space-y-2">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
                Billing history
              </p>
              <CarePlanBillingHistory invoices={billingHistory} />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Milestones */}
      <section>
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-semibold tabular-nums text-copper">
            01
          </span>
          <span aria-hidden className="h-3.5 w-px bg-copper/40" />
          <h2 className="font-display text-lg font-medium tracking-tight text-ink">
            Milestones
          </h2>
        </div>

        {project.milestones.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
            <p className="font-sans text-sm text-ink-muted">
              No visible milestones. The team will add them as the work
              takes shape.
            </p>
          </div>
        ) : (
          <ol className="mt-5 space-y-2">
            {project.milestones.map((m, i) => {
              const link = milestoneHref(id, m);
              const body = (
                <>
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-mono text-[11px] tabular-nums text-ink-subtle">
                    {(i + 1).toString().padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <h4
                        className={cn(
                          'font-sans text-sm font-medium text-ink',
                          m.status === 'done' && 'line-through decoration-ink-subtle',
                        )}
                      >
                        {m.title}
                      </h4>
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]',
                          MILESTONE_TONE[m.status],
                        )}
                      >
                        {MILESTONE_LABEL[m.status]}
                      </span>
                    </div>
                    {m.description ? (
                      <p className="mt-1 whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink-muted">
                        {m.description}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
                        {m.dueDate ? `Due ${formatDate(m.dueDate)}` : 'No due date'}
                      </p>
                      {link ? (
                        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-copper">
                          {link.hint} →
                        </span>
                      ) : null}
                    </div>
                  </div>
                </>
              );
              const baseCls = cn(
                'flex items-start gap-4 rounded-xl border border-border bg-surface p-4',
                m.status === 'done' && 'opacity-80',
              );
              return (
                <li key={m.id}>
                  {link ? (
                    <Link
                      href={link.href}
                      className={cn(
                        baseCls,
                        'transition-colors hover:border-copper/40 hover:bg-surface/80 focus:outline-none focus-visible:border-copper',
                      )}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className={baseCls}>{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
