'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';

export type ClientTabKey =
  | 'overview'
  | 'engagements'
  | 'notes'
  | 'activity';

const TABS: { key: ClientTabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'engagements', label: 'Engagements' },
  { key: 'notes', label: 'Notes' },
  { key: 'activity', label: 'Activity' },
];

export function ClientTabs({
  active,
  counts,
}: {
  active: ClientTabKey;
  counts?: Partial<Record<ClientTabKey, number>>;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();

  function go(key: ClientTabKey) {
    const next = new URLSearchParams(sp.toString());
    if (key === 'overview') next.delete('tab');
    else next.set('tab', key);
    startTransition(() => {
      router.push(next.toString() ? `${pathname}?${next.toString()}` : pathname);
    });
  }

  return (
    <nav className="flex items-end gap-1 border-b border-border bg-surface px-8">
      {TABS.map((t) => {
        const isActive = active === t.key;
        const count = counts?.[t.key];
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => go(t.key)}
            className={cn(
              'group relative -mb-px flex items-center gap-2 border-b-2 px-3 py-3 font-sans text-sm font-medium transition-colors',
              isActive
                ? 'border-copper text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
            {typeof count === 'number' && count > 0 ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                  isActive
                    ? 'bg-copper-soft/60 text-copper'
                    : 'bg-surface-2 text-ink-muted',
                )}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
