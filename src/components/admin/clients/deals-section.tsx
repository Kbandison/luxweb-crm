import type { DealSummary } from '@/lib/queries/admin';
import { STAGE_DOT, STAGE_LABEL } from '@/components/admin/pipeline/stage-meta';
import { PROJECT_STATUS_DOT } from '@/components/admin/projects/status-meta';
import { formatDate, formatUSD } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export function DealsSection({ deals }: { deals: DealSummary[] }) {
  if (deals.length === 0) {
    return <Empty label="No deals open with this client." />;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[720px]">
        <thead className="border-b border-border bg-surface text-left">
          <tr className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            <th className="px-5 py-3 font-medium">Deal</th>
            <th className="px-3 py-3 font-medium">Stage</th>
            <th className="px-3 py-3 text-right font-medium">Value</th>
            <th className="px-3 py-3 text-right font-medium">Probability</th>
            <th className="px-5 py-3 text-right font-medium">Expected close</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.id} className="border-b border-border last:border-b-0">
              <td className="px-5 py-3 font-sans text-sm text-ink">{d.title}</td>
              <td className="px-3 py-3">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-muted">
                  <span className={cn('h-1.5 w-1.5 rounded-full', STAGE_DOT[d.stage])} aria-hidden />
                  {STAGE_LABEL[d.stage]}
                </span>
              </td>
              <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-ink">
                {formatUSD(d.valueCents)}
              </td>
              <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-ink-muted">
                {d.probability}%
              </td>
              <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                {formatDate(d.expectedClose)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProjectsSection({
  projects,
}: {
  projects: import('@/lib/queries/admin').ProjectSummary[];
}) {
  if (projects.length === 0) {
    return <Empty label="No projects for this client." />;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[720px]">
        <thead className="border-b border-border bg-surface text-left">
          <tr className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            <th className="px-5 py-3 font-medium">Project</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 font-medium">Start</th>
            <th className="px-3 py-3 font-medium">End</th>
            <th className="px-5 py-3 text-right font-medium">Budget</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-b-0">
              <td className="px-5 py-3 font-sans text-sm text-ink">{p.name}</td>
              <td className="px-3 py-3">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-muted">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      PROJECT_STATUS_DOT[p.status as import('@/lib/queries/admin').ProjectStatus] ??
                        'bg-ink-subtle',
                    )}
                    aria-hidden
                  />
                  {p.status.replace('_', ' ')}
                </span>
              </td>
              <td className="px-3 py-3 font-mono text-xs tabular-nums text-ink-muted">
                {formatDate(p.startDate)}
              </td>
              <td className="px-3 py-3 font-mono text-xs tabular-nums text-ink-muted">
                {formatDate(p.endDate)}
              </td>
              <td className="px-5 py-3 text-right font-mono text-sm tabular-nums text-ink">
                {p.budgetCents != null ? formatUSD(p.budgetCents) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
      <p className="font-sans text-sm text-ink-muted">{label}</p>
    </div>
  );
}
