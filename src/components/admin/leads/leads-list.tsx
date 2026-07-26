'use client';
import { useMemo, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ContactRow, LeadOwnerOption } from '@/lib/queries/admin';
import type { SortDir } from '@/lib/list-params';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useUrlSearchInput } from '@/lib/hooks/use-url-search';
import { LeadScore } from './lead-score';
import { TagPill } from './tag-pill';
import { Monogram } from './monogram';

const SORT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'created_at:desc', label: 'Newest first' },
  { value: 'created_at:asc', label: 'Oldest first' },
  { value: 'full_name:asc', label: 'Name A → Z' },
  { value: 'full_name:desc', label: 'Name Z → A' },
  { value: 'lead_score:desc', label: 'Score high → low' },
  { value: 'lead_score:asc', label: 'Score low → high' },
];

export function LeadsList({
  initial,
  selectedId,
  currentSort,
  currentDir,
  searchParams: spProps,
  selectedIds,
  onToggleRow,
  onToggleAll,
  owners = [],
  currentOwner = '',
}: {
  initial: ContactRow[];
  selectedId: string | null;
  currentSort: string;
  currentDir: SortDir;
  searchParams: Record<string, string | string[] | undefined>;
  /** Optional bulk-selection state — when present, each row gets a checkbox. */
  selectedIds?: Set<string>;
  onToggleRow?: (id: string) => void;
  onToggleAll?: (rows: ContactRow[]) => void;
  /** Assignable owners for the filter dropdown. */
  owners?: LeadOwnerOption[];
  /** Current ?owner= filter value ('' = all, 'unassigned', or a user id). */
  currentOwner?: string;
}) {
  const { q: query, setQ: setQuery } = useUrlSearchInput();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Local fast-path filter so typing is snappy; server returns the filtered
  // rows once the URL-debounced commit fires.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initial;
    return initial.filter((c) =>
      [c.fullName, c.email, c.company, ...(c.tags ?? [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [initial, query]);

  const selectable = Boolean(selectedIds && onToggleRow && onToggleAll);
  const selectedCount = selectable
    ? filtered.reduce(
        (n, r) => (selectedIds!.has(r.id) ? n + 1 : n),
        0,
      )
    : 0;
  const allSelected = selectable && filtered.length > 0 && selectedCount === filtered.length;
  const someSelected = selectable && selectedCount > 0 && !allSelected;

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

  const currentSortValue = `${currentSort}:${currentDir}`;
  function onSortChange(value: string) {
    const [field, dir] = value.split(':');
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('sort', field);
    sp.set('dir', dir);
    sp.delete('page');
    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`);
    });
  }

  function onOwnerFilterChange(value: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) sp.set('owner', value);
    else sp.delete('owner');
    sp.delete('page');
    startTransition(() => {
      router.push(sp.toString() ? `${pathname}?${sp.toString()}` : pathname);
    });
  }
  // Silence the unused-import lint when SortableHeader was previously imported.
  void spProps;

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

      {/* Selection + sort row — single compact strip, no per-column chips. */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2">
        <div className="flex items-center gap-3">
          {selectable ? (
            <input
              type="checkbox"
              aria-label={
                allSelected ? 'Deselect all leads' : 'Select all leads'
              }
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={() => onToggleAll!(filtered)}
              className="h-4 w-4 cursor-pointer accent-copper"
            />
          ) : null}
          <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
            {selectable && selectedCount > 0
              ? `${selectedCount} selected`
              : `${filtered.length} ${filtered.length === 1 ? 'lead' : 'leads'}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {owners.length > 0 ? (
            <label className="flex items-center gap-2">
              <span className="sr-only">Filter by owner</span>
              <select
                value={currentOwner}
                onChange={(e) => onOwnerFilterChange(e.target.value)}
                className="max-w-[9rem] rounded-md border border-border bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-meta text-ink-muted hover:border-border-strong focus:border-copper focus:outline-none"
              >
                <option value="">All owners</option>
                <option value="unassigned">Unassigned</option>
                {owners.map((o) => (
                  <option key={o.userId} value={o.userId}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex items-center gap-2">
            <span className="sr-only">Sort leads</span>
            <select
              value={currentSortValue}
              onChange={(e) => onSortChange(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-meta text-ink-muted hover:border-border-strong focus:border-copper focus:outline-none"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          query ? (
            <div className="flex h-full items-center justify-center px-6 py-12 text-center">
              <p className="font-sans text-sm text-ink-muted">
                No leads match &ldquo;{query}&rdquo;.
              </p>
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title="No leads yet"
                description="Add one with the button above."
              />
            </div>
          )
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((lead) => (
              <li key={lead.id} className={cn(
                'flex items-start',
                selectedId === lead.id ? 'bg-copper-soft/25' : '',
              )}>
                {selectable ? (
                  <label className="flex shrink-0 cursor-pointer items-center self-stretch px-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${lead.fullName}`}
                      checked={selectedIds!.has(lead.id)}
                      onChange={() => onToggleRow!(lead.id)}
                      className="h-4 w-4 cursor-pointer accent-copper"
                    />
                  </label>
                ) : null}
                <Link
                  href={hrefFor(lead.id)}
                  className={cn(
                    'block flex-1 px-4 py-3 transition-colors',
                    selectable ? 'pl-0' : '',
                    selectedId === lead.id
                      ? ''
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
                      <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                        {lead.ownerName ? (
                          <>Owner · <span className="text-ink-muted">{lead.ownerName}</span></>
                        ) : (
                          'Unassigned'
                        )}
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
        <p className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
          {filtered.length}
          {query ? ` of ${initial.length}` : ''} lead
          {filtered.length === 1 ? '' : 's'}
        </p>
        {selectedId ? (
          <button
            type="button"
            onClick={clearSelection}
            className="font-mono text-[10px] uppercase tracking-meta text-copper hover:underline lg:hidden"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
