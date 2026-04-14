'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ClientRow } from '@/lib/queries/admin';
import { Input } from '@/components/ui/input';
import { Monogram } from '@/components/admin/leads/monogram';
import { TagPill } from '@/components/admin/leads/tag-pill';
import { formatUSD } from '@/lib/formatters';

export function ClientsTable({ initial }: { initial: ClientRow[] }) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return initial;
    return initial.filter((c) =>
      [c.fullName, c.email, c.company, ...c.tags]
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
            placeholder="Search clients…"
            className="h-9 pl-9"
          />
        </div>
        <p className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
          {filtered.length}
          {q ? ` of ${initial.length}` : ''} client
          {filtered.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 py-12 text-center">
            <p className="font-sans text-sm text-ink-muted">
              {q
                ? `No clients match “${q}”.`
                : 'No clients. Add a lead in the Leads inbox to get started.'}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-border bg-surface text-left">
              <tr className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                <th className="px-6 py-3 font-medium">Client</th>
                <th className="px-3 py-3 font-medium">Tags</th>
                <th className="px-3 py-3 text-right font-medium">Open value</th>
                <th className="px-3 py-3 text-right font-medium">Deals</th>
                <th className="px-3 py-3 text-right font-medium">Projects</th>
                <th className="w-12 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border bg-surface transition-colors hover:bg-copper-soft/15"
                >
                  <td className="px-6 py-3">
                    <Link
                      href={`/admin/clients/${c.id}`}
                      className="flex items-center gap-3"
                    >
                      <Monogram name={c.fullName} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-sans text-sm font-medium text-ink">
                          {c.fullName}
                        </p>
                        <p className="truncate font-sans text-xs text-ink-muted">
                          {c.company ?? c.email ?? '—'}
                        </p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.slice(0, 3).map((t) => (
                        <TagPill key={t} size="xs">
                          {t}
                        </TagPill>
                      ))}
                      {c.tags.length > 3 ? (
                        <span className="font-mono text-[10px] text-ink-subtle">
                          +{c.tags.length - 3}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="font-mono text-sm tabular-nums text-ink">
                      {formatUSD(c.openValueCents)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="font-mono text-sm tabular-nums text-ink-muted">
                      {c.dealCount}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="font-mono text-sm tabular-nums text-ink-muted">
                      {c.projectCount}
                    </span>
                  </td>
                  <td className="py-3 pr-6 text-right">
                    <Link
                      href={`/admin/clients/${c.id}`}
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
