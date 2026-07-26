import Link from 'next/link';
import { StatusPill } from '@/components/ui/status-pill';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import type { TeamMemberRow } from '@/lib/queries/team';
import { EMPLOYMENT_LABEL, ROLE_TONE, STATUS_TONE, formatRate } from './team-meta';

/**
 * Roster table. Presentational + server-safe — the interactive bits (create,
 * edit, invite, assign) live in the header action and the detail page.
 * `showRates` hides the pay column for viewers without finance visibility.
 */
export function TeamTable({
  rows,
  showRates = true,
}: {
  rows: TeamMemberRow[];
  showRates?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Status</th>
            {showRates ? <th className="px-4 py-3 font-medium">Rate</th> : null}
            <th className="px-4 py-3 text-right font-medium">Projects</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr
              key={m.id}
              className="group border-b border-border/60 transition-colors hover:bg-surface-2/60"
            >
              <td className="px-4 py-3">
                <Link href={`/admin/team/${m.id}`} className="block">
                  <span className="font-medium text-ink group-hover:text-copper">
                    {m.fullName}
                  </span>
                  {m.title ? (
                    <span className="mt-0.5 block font-sans text-xs text-ink-subtle">
                      {m.title}
                    </span>
                  ) : null}
                </Link>
              </td>
              <td className="px-4 py-3">
                <StatusPill label={ROLE_LABELS[m.role]} tone={ROLE_TONE[m.role]} />
              </td>
              <td className="px-4 py-3 text-ink-muted">
                {EMPLOYMENT_LABEL[m.employmentType]}
              </td>
              <td className="px-4 py-3">
                <StatusPill
                  label={m.status}
                  tone={STATUS_TONE[m.status]}
                  size="sm"
                />
              </td>
              {showRates ? (
                <td className="px-4 py-3 tabular-nums text-ink-muted">
                  {formatRate(m.rateCents, m.rateType)}
                </td>
              ) : null}
              <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                {m.assignmentCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
