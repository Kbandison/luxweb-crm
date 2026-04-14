'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ProjectListRow } from '@/lib/queries/admin';
import { Input } from '@/components/ui/input';
import { formatHours, formatUSD } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { PROJECT_STATUS_DOT, PROJECT_STATUS_LABEL } from './status-meta';

export function ProjectsTable({ initial }: { initial: ProjectListRow[] }) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return initial;
    return initial.filter((p) =>
      [p.name, p.contactName, p.contactCompany]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [initial, q]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-surface px-6 py-3">
        <div className="relative w-full max-w-sm">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects…"
            className="h-9 pl-9"
          />
        </div>
        <p className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
          {filtered.length}
          {q ? ` of ${initial.length}` : ''} project
          {filtered.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 py-12 text-center">
            <p className="font-sans text-sm text-ink-muted">
              {q
                ? `No projects match “${q}”.`
                : 'No projects. Create one with the button above.'}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-border bg-surface text-left">
              <tr className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                <th className="px-6 py-3 font-medium">Project</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Client</th>
                <th className="px-3 py-3 font-medium">Milestones</th>
                <th className="px-3 py-3 text-right font-medium">Hours</th>
                <th className="px-3 py-3 text-right font-medium">Budget</th>
                <th className="w-12 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border bg-surface transition-colors hover:bg-copper-soft/15"
                >
                  <td className="px-6 py-3">
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="font-sans text-sm font-medium text-ink hover:text-copper"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-muted">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          PROJECT_STATUS_DOT[p.status],
                        )}
                        aria-hidden
                      />
                      {PROJECT_STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-sans text-sm text-ink">
                    <Link
                      href={`/admin/clients/${p.contactId}`}
                      className="hover:text-copper"
                    >
                      {p.contactName}
                    </Link>
                    {p.contactCompany ? (
                      <span className="ml-1 font-sans text-xs text-ink-muted">
                        · {p.contactCompany}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-mono text-xs tabular-nums text-ink-muted">
                      {p.doneMilestoneCount}/{p.milestoneCount}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                    {formatHours(p.hoursLogged, 1)}h
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-ink">
                    {p.budgetCents != null
                      ? formatUSD(p.budgetCents)
                      : '—'}
                  </td>
                  <td className="py-3 pr-6 text-right">
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper hover:underline"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
