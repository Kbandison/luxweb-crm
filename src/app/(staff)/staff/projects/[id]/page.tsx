import { getProjectDetail, getProjectMilestones } from '@/lib/queries/admin';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHead } from '@/components/ui/section-head';
import { formatDate } from '@/lib/formatters';

// Delivery-only milestone tones — contractors never see amounts/invoices.
const MILESTONE_TONE: Record<string, string> = {
  done: 'bg-success/15 text-success',
  in_progress: 'bg-warning/15 text-warning',
  blocked: 'bg-danger/10 text-danger',
  pending: 'bg-surface-2 text-ink-muted',
  inactive: 'bg-surface-2 text-ink-subtle',
};

export default async function StaffProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, milestones] = await Promise.all([
    getProjectDetail(id),
    getProjectMilestones(id),
  ]);

  return (
    <div className="space-y-10">
      {/* Key facts (no budget/profitability — those are admin-only) */}
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <Field label="Start" value={project?.startDate ? formatDate(project.startDate) : '—'} />
        <Field label="Target end" value={project?.endDate ? formatDate(project.endDate) : '—'} />
        {project?.previewUrl ? (
          <div className="space-y-1 sm:col-span-2">
            <dt className="font-mono text-[10px] font-medium uppercase tracking-meta text-ink-muted">
              Preview
            </dt>
            <dd>
              <a
                href={project.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-sans text-sm text-copper underline-offset-4 hover:underline"
              >
                {project.previewUrl}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>

      {/* Milestones */}
      <section className="space-y-4">
        <SectionHead number="01" title="Milestones" description="The plan for this project." />
        {milestones.length === 0 ? (
          <EmptyState title="No milestones yet" description="The studio hasn't set milestones on this project." />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-sans text-sm font-medium text-ink">{m.title}</p>
                  {m.description ? (
                    <p className="mt-0.5 font-sans text-xs text-ink-muted">{m.description}</p>
                  ) : null}
                  {m.dueDate ? (
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                      Due {formatDate(m.dueDate)}
                    </p>
                  ) : null}
                </div>
                <StatusPill
                  label={m.status.replace(/_/g, ' ')}
                  tone={MILESTONE_TONE[m.status] ?? 'bg-surface-2 text-ink-muted'}
                  size="sm"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="font-mono text-[10px] font-medium uppercase tracking-meta text-ink-muted">
        {label}
      </dt>
      <dd className="font-sans text-sm text-ink">{value}</dd>
    </div>
  );
}
