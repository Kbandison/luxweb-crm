import type { ClientActivity } from '@/lib/queries/admin';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/formatters';

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-success/10 text-success',
  update: 'bg-info/10 text-info',
  delete: 'bg-danger/10 text-danger',
  send: 'bg-copper/15 text-copper',
  accept: 'bg-success/15 text-success',
  reject: 'bg-danger/10 text-danger',
};

export function ActivityList({ rows }: { rows: ClientActivity[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
        <p className="font-sans text-sm text-ink-muted">
          No audit log entries for this client.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-4 px-5 py-4"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span
                className={cn(
                  'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]',
                  ACTION_COLORS[r.action] ?? 'bg-ink/5 text-ink-muted',
                )}
              >
                {r.action}
              </span>
              <div className="min-w-0">
                <p className="truncate font-sans text-sm text-ink">
                  <span className="font-medium">{r.entityType}</span>
                  {r.entityId ? (
                    <span className="font-mono text-xs text-ink-subtle">
                      {' '}· {r.entityId.slice(0, 8)}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate font-sans text-xs text-ink-muted">
                  {r.actorEmail ?? 'system'}
                </p>
              </div>
            </div>
            <time
              className="shrink-0 font-mono text-xs tabular-nums text-ink-subtle"
              dateTime={r.createdAt}
            >
              {formatRelative(r.createdAt)}
            </time>
          </li>
        ))}
      </ul>
    </div>
  );
}

