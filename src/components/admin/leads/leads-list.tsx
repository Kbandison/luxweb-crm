'use client';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ContactRow } from '@/lib/queries/admin';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { LeadScore } from './lead-score';
import { TagPill } from './tag-pill';
import { Monogram } from './monogram';

export function LeadsList({
  initial,
  selectedId,
}: {
  initial: ContactRow[];
  selectedId: string | null;
}) {
  const [query, setQuery] = useState('');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initial;
    return initial.filter((c) =>
      [c.fullName, c.email, c.company, ...(c.tags ?? [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [initial, query]);

  function hrefFor(leadId: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('lead', leadId);
    return `${pathname}?${sp.toString()}`;
  }

  function clearSelection() {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete('lead');
    startTransition(() => {
      router.push(sp.toString() ? `${pathname}?${sp.toString()}` : pathname);
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="border-b border-border px-4 py-3">
        <div className="relative">
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search leads…"
            className="h-9 pl-9"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 font-mono text-[10px] uppercase tracking-wide text-ink-subtle hover:text-ink"
            >
              clear
            </button>
          ) : null}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 py-12 text-center">
            <p className="font-sans text-sm text-ink-muted">
              {query
                ? `No leads match “${query}”.`
                : 'No leads. Add one with the button above.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={hrefFor(lead.id)}
                  className={cn(
                    'block px-4 py-3 transition-colors',
                    selectedId === lead.id
                      ? 'bg-copper-soft/25'
                      : 'hover:bg-surface-2',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Monogram name={lead.fullName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate font-sans text-sm font-medium text-ink">
                          {lead.fullName}
                        </p>
                        <LeadScore score={lead.leadScore} />
                      </div>
                      <p className="mt-0.5 truncate font-sans text-xs text-ink-muted">
                        {[lead.company, lead.email].filter(Boolean).join(' · ') ||
                          '—'}
                      </p>
                      {lead.tags.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {lead.tags.slice(0, 3).map((t) => (
                            <TagPill key={t} size="xs">
                              {t}
                            </TagPill>
                          ))}
                          {lead.tags.length > 3 ? (
                            <span className="font-mono text-[10px] text-ink-subtle">
                              +{lead.tags.length - 3}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer — count */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
          {filtered.length}
          {query ? ` of ${initial.length}` : ''} lead
          {filtered.length === 1 ? '' : 's'}
        </p>
        {selectedId ? (
          <button
            type="button"
            onClick={clearSelection}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper hover:underline lg:hidden"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
