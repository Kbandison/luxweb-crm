'use client';
import { useState } from 'react';
import type { AuditEntry } from '@/lib/queries/audit';
import { formatDateTimeWithTz } from '@/lib/formatters';
import { cn } from '@/lib/utils';

const ACTION_TONE: Record<string, string> = {
  create: 'bg-success/10 text-success',
  update: 'bg-info/10 text-info',
  delete: 'bg-danger/10 text-danger',
  send: 'bg-copper/15 text-copper',
  accept: 'bg-success/15 text-success',
  reject: 'bg-danger/10 text-danger',
};

export function AuditTable({ entries }: { entries: AuditEntry[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/60 p-10 text-center">
        <p className="font-sans text-sm text-ink-muted">
          No audit entries match the current filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[780px]">
        <thead className="border-b border-border bg-surface text-left">
          <tr className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            <th className="px-4 py-3 font-medium">Action</th>
            <th className="px-3 py-3 font-medium">Entity</th>
            <th className="px-3 py-3 font-medium">Actor</th>
            <th className="px-3 py-3 font-medium">When</th>
            <th className="w-14 px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const isOpen = openId === e.id;
            const tone = ACTION_TONE[e.action] ?? 'bg-ink/5 text-ink-muted';
            return (
              <ExpandableRow
                key={e.id}
                entry={e}
                isOpen={isOpen}
                onToggle={() => setOpenId(isOpen ? null : e.id)}
                tone={tone}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ExpandableRow({
  entry: e,
  isOpen,
  onToggle,
  tone,
}: {
  entry: AuditEntry;
  isOpen: boolean;
  onToggle: () => void;
  tone: string;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          'cursor-pointer border-b border-border transition-colors hover:bg-surface-2/50',
          isOpen && 'bg-surface-2/60',
        )}
      >
        <td className="px-4 py-3">
          <span
            className={cn(
              'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em]',
              tone,
            )}
          >
            {e.action}
          </span>
        </td>
        <td className="px-3 py-3 font-mono text-xs text-ink">
          <span className="font-medium">{e.entityType}</span>
          {e.entityId ? (
            <span className="text-ink-subtle"> · {e.entityId.slice(0, 8)}</span>
          ) : null}
        </td>
        <td className="px-3 py-3 font-sans text-xs text-ink-muted">
          {e.actorName ?? e.actorEmail ?? (
            <span className="italic text-ink-subtle">system</span>
          )}
        </td>
        <td className="px-3 py-3 font-mono text-[11px] tabular-nums text-ink-muted">
          {formatDateTimeWithTz(e.createdAt)}
        </td>
        <td className="px-3 py-3 text-right">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
              'inline h-3.5 w-3.5 text-ink-subtle transition-transform',
              isOpen && 'rotate-180 text-copper',
            )}
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </td>
      </tr>
      {isOpen ? (
        <tr className="border-b border-border bg-surface-2/30">
          <td colSpan={5} className="px-5 py-4">
            <dl className="grid gap-3 font-mono text-[11px] text-ink-muted sm:grid-cols-2">
              <div>
                <dt className="uppercase tracking-[0.16em] text-ink-subtle">
                  Audit ID
                </dt>
                <dd className="mt-1 text-ink">{e.id}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-[0.16em] text-ink-subtle">
                  Entity ID
                </dt>
                <dd className="mt-1 text-ink">{e.entityId ?? '—'}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-[0.16em] text-ink-subtle">
                  Actor
                </dt>
                <dd className="mt-1 text-ink">
                  {e.actorName ? `${e.actorName} · ` : ''}
                  {e.actorEmail ?? 'system'}
                </dd>
              </div>
              <div>
                <dt className="uppercase tracking-[0.16em] text-ink-subtle">
                  Actor ID
                </dt>
                <dd className="mt-1 text-ink">{e.actorId ?? 'system'}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
                Diff
              </p>
              {e.diff ? (
                <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-border bg-surface p-4 font-mono text-[11px] leading-relaxed text-ink">
                  {JSON.stringify(e.diff, null, 2)}
                </pre>
              ) : (
                <p className="mt-2 font-sans text-xs text-ink-subtle">
                  No diff recorded.
                </p>
              )}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
