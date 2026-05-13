import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getNotesForEntity,
  getProjectCarePlan,
  getProjectDetail,
  getProjectInvoices,
  getProjectMilestones,
  getProjectReview,
} from '@/lib/queries/admin';
import { NotesPanel } from '@/components/admin/clients/notes-panel';
import { getCarePlanInvoiceHistory } from '@/lib/care-plan/billing-history';
import { AdminCarePlanSection } from '@/components/admin/care-plan/care-plan-section';
import { CarePlanBillingHistory } from '@/components/care-plan/billing-history';
import { AdminReviewCard } from '@/components/admin/reviews/admin-review-card';
import {
  MILESTONE_STATUS_LABEL,
  MILESTONE_STATUS_TONE,
} from '@/components/admin/projects/status-meta';
import { StatCard } from '@/components/ui/stat-card';
import { SectionHead } from '@/components/ui/section-head';
import { StatusPill } from '@/components/ui/status-pill';
import { formatDate, formatUSD } from '@/lib/formatters';

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, milestones, invoices, carePlan, review, notes] = await Promise.all([
    getProjectDetail(id),
    getProjectMilestones(id),
    getProjectInvoices(id),
    getProjectCarePlan(id),
    getProjectReview(id),
    getNotesForEntity('project', id),
  ]);
  if (!project) notFound();
  const billingHistory = carePlan
    ? await getCarePlanInvoiceHistory(carePlan.stripeSubscriptionId)
    : [];

  const paidCents = invoices
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + i.amountCents, 0);
  const invoicedCents = invoices
    .filter((i) => i.status !== 'void' && i.status !== 'draft')
    .reduce((s, i) => s + i.amountCents, 0);
  const outstandingCents = invoicedCents - paidCents;
  const doneCount = milestones.filter((m) => m.status === 'done').length;
  const upcoming = milestones
    .filter((m) => m.status !== 'done' && m.dueDate)
    .sort(
      (a, b) =>
        new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime(),
    )
    .slice(0, 3);

  const showCarePlan = carePlan != null;
  const showReview = review != null || project.status === 'completed';

  const sections: ReadonlyArray<{ visible: boolean; key: string; render: (n: string) => React.ReactNode }> = [
    {
      visible: true,
      key: 'glance',
      render: (n) => (
        <section key="glance">
          <SectionHead number={n} title="At a glance" />
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Milestones"
              value={`${doneCount}/${milestones.length}`}
              hint={
                milestones.length === 0
                  ? 'None set'
                  : `${Math.round((doneCount / milestones.length) * 100)}% done`
              }
              size="lg"
            />
            <StatCard
              label="Paid"
              value={formatUSD(paidCents)}
              hint={
                outstandingCents > 0
                  ? `${formatUSD(outstandingCents)} outstanding`
                  : invoicedCents > 0
                    ? 'All invoiced paid'
                    : 'Nothing invoiced'
              }
              size="lg"
            />
            <StatCard
              label="Days running"
              value={String(daysSince(project.createdAt))}
              hint={`Since ${formatDate(project.createdAt)}`}
              size="lg"
            />
          </div>
        </section>
      ),
    },
    {
      visible: true,
      key: 'milestones',
      render: (n) => (
        <section key="milestones">
          <SectionHead
            number={n}
            title="Upcoming milestones"
            right={
              <Link
                href={`/admin/projects/${project.id}/milestones`}
                className="font-mono text-[10px] uppercase tracking-meta text-copper hover:underline"
              >
                View all →
              </Link>
            }
          />
          {upcoming.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
              <p className="font-sans text-sm text-ink-muted">
                {milestones.length === 0
                  ? 'No milestones — add the first one in the Milestones tab.'
                  : 'Nothing coming up. All known milestones are done or have no due date.'}
              </p>
            </div>
          ) : (
            <ul className="mt-5 space-y-2">
              {upcoming.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-sm font-medium text-ink">
                      {m.title}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                      Due {formatDate(m.dueDate!)}
                    </p>
                  </div>
                  <StatusPill
                    label={MILESTONE_STATUS_LABEL[m.status]}
                    tone={MILESTONE_STATUS_TONE[m.status]}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ),
    },
    {
      visible: showCarePlan,
      key: 'care',
      render: (n) => (
        <section key="care">
          <SectionHead number={n} title="Care Plan" />
          <div className="mt-5">
            <AdminCarePlanSection
              projectId={project.id}
              plan={
                carePlan
                  ? {
                      id: carePlan.id,
                      amountCents: carePlan.amountCents,
                      interval: carePlan.interval,
                      status: carePlan.status,
                      currentPeriodEnd: carePlan.currentPeriodEnd,
                      cancelAtPeriodEnd: carePlan.cancelAtPeriodEnd,
                      paymentMethodBrand: carePlan.paymentMethodBrand,
                      paymentMethodLast4: carePlan.paymentMethodLast4,
                    }
                  : null
              }
            />
            {carePlan ? (
              <div className="mt-4 space-y-2">
                <p className="font-mono text-[10px] font-medium uppercase tracking-meta text-ink-muted">
                  Billing history
                </p>
                <CarePlanBillingHistory invoices={billingHistory} />
              </div>
            ) : null}
          </div>
        </section>
      ),
    },
    {
      visible: showReview,
      key: 'review',
      render: (n) => (
        <section key="review">
          <SectionHead number={n} title="Review" />
          <div className="mt-5">
            <AdminReviewCard projectId={project.id} review={review} />
          </div>
        </section>
      ),
    },
    {
      visible: true,
      key: 'notes',
      render: (n) => (
        <section key="notes">
          <SectionHead number={n} title="Notes" />
          <div className="mt-5">
            <NotesPanel entityType="project" entityId={project.id} notes={notes} />
          </div>
        </section>
      ),
    },
  ];

  const visibleSections = sections.filter((s) => s.visible);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-12 px-8 py-8">
      {visibleSections.map((s, i) =>
        s.render(String(i + 1).padStart(2, '0')),
      )}
    </main>
  );
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
