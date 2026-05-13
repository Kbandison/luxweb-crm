'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

type CommandType = 'nav' | 'action' | 'client' | 'lead' | 'project';

type CommandItem = {
  id: string;
  type: CommandType;
  label: string;
  hint?: string;
  href: string;
};

type SearchResponse = {
  clients: { id: string; full_name: string; company: string | null }[];
  leads: { id: string; full_name: string; company: string | null }[];
  projects: { id: string; name: string; contact_name: string }[];
};

/* -------------------------------------------------------------------------
 * Static items
 *
 * Navigation + quick actions — always present, filtered by substring match
 * when the user types. Order here is the order they render in the default
 * (no-query) view, grouped by `type`.
 * ------------------------------------------------------------------------- */

const STATIC_ITEMS: CommandItem[] = [
  // Navigation
  { id: 'nav-dashboard', type: 'nav', label: 'Dashboard', href: '/admin/dashboard' },
  { id: 'nav-leads', type: 'nav', label: 'Leads', href: '/admin/leads' },
  { id: 'nav-pipeline', type: 'nav', label: 'Pipeline', href: '/admin/pipeline' },
  { id: 'nav-clients', type: 'nav', label: 'Clients', href: '/admin/clients' },
  { id: 'nav-projects', type: 'nav', label: 'Projects', href: '/admin/projects' },
  { id: 'nav-revisions', type: 'nav', label: 'Revisions queue', href: '/admin/revisions' },
  { id: 'nav-care-plans', type: 'nav', label: 'Care plans queue', href: '/admin/care-plans' },
  { id: 'nav-reviews', type: 'nav', label: 'Reviews queue', href: '/admin/reviews' },
  { id: 'nav-earnings', type: 'nav', label: 'Earnings', href: '/admin/earnings' },
  { id: 'nav-audit', type: 'nav', label: 'Audit log', href: '/admin/audit' },
  { id: 'nav-settings', type: 'nav', label: 'Settings', href: '/admin/settings' },

  // Quick actions — navigate to the page that hosts the create UI.
  { id: 'action-new-lead', type: 'action', label: 'New lead', href: '/admin/leads' },
  { id: 'action-new-project', type: 'action', label: 'New project', href: '/admin/projects' },
  { id: 'action-new-deal', type: 'action', label: 'New deal', href: '/admin/pipeline' },
];

/* -------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function groupLabel(type: CommandType): string {
  switch (type) {
    case 'nav':
      return 'Nav';
    case 'action':
      return 'Action';
    case 'client':
      return 'Client';
    case 'lead':
      return 'Lead';
    case 'project':
      return 'Project';
  }
}

function groupOrder(type: CommandType): number {
  // Render order: Nav → Action → search results.
  switch (type) {
    case 'nav':
      return 0;
    case 'action':
      return 1;
    case 'client':
      return 2;
    case 'project':
      return 3;
    case 'lead':
      return 4;
  }
}

function groupHeading(type: CommandType): string {
  switch (type) {
    case 'nav':
      return 'Navigate';
    case 'action':
      return 'Quick actions';
    case 'client':
      return 'Clients';
    case 'lead':
      return 'Leads';
    case 'project':
      return 'Projects';
  }
}

function ItemIcon({ type }: { type: CommandType }) {
  // Tiny inline glyphs — keep visual weight minimal, lean on the type label
  // on the right for context. All paths share the same stroke style as the
  // sidebar icons for consistency.
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'h-4 w-4 shrink-0',
  };
  switch (type) {
    case 'nav':
      return (
        <svg {...common}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      );
    case 'action':
      return (
        <svg {...common}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case 'client':
      return (
        <svg {...common}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 'lead':
      return (
        <svg {...common}>
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
        </svg>
      );
    case 'project':
      return (
        <svg {...common}>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );
  }
}

/* -------------------------------------------------------------------------
 * CommandPalette
 *
 * Self-contained ⌘K palette. Mount once globally; it owns its own keyboard
 * listener and dialog. External code can also dispatch a `cmdk:open` /
 * `cmdk:close` CustomEvent on window to toggle programmatically (used by the
 * topbar hint button).
 * ------------------------------------------------------------------------- */

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  /* ----------------------------- open / close ----------------------------- */

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // Reset transient state whenever we close the palette so the next open
  // starts from a clean slate (no stale query, no stale selection).
  useEffect(() => {
    if (open) return;
    setQuery('');
    setDebounced('');
    setResults(null);
    setSelectedIndex(0);
  }, [open]);

  // Global ⌘K / Ctrl+K shortcut. Skip when focus is inside an editable
  // element — otherwise typing ⌘K in a normal search box would hijack the
  // user. Escape is handled by Dialog (closeOnEscape).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      if (e.key !== 'k' && e.key !== 'K') return;
      // Allow the shortcut even when an input is focused — but only if the
      // dialog is already open (so re-pressing ⌘K from the palette input
      // closes it). When closed, ignore if user is typing somewhere else.
      if (!open && target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      e.preventDefault();
      setOpen((o) => !o);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // External open/close hooks. The topbar button dispatches `cmdk:open`.
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    function onClose() {
      setOpen(false);
    }
    window.addEventListener('cmdk:open', onOpen);
    window.addEventListener('cmdk:close', onClose);
    return () => {
      window.removeEventListener('cmdk:open', onOpen);
      window.removeEventListener('cmdk:close', onClose);
    };
  }, []);

  // Autofocus the input whenever the palette opens. Dialog's autofocus
  // would normally pick the first focusable, but we want to be defensive
  // in case the input ordering changes later.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 10);
    return () => window.clearTimeout(id);
  }, [open]);

  /* ----------------------------- debounce search ----------------------------- */

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    if (!debounced) {
      setResults(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/admin/search?q=${encodeURIComponent(debounced)}`, {
      signal: ctrl.signal,
      cache: 'no-store',
    })
      .then((r) => (r.ok ? (r.json() as Promise<SearchResponse>) : null))
      .then((j) => {
        if (j) setResults(j);
      })
      .catch(() => {
        /* aborted or failed — leave previous results in place */
      });
    return () => ctrl.abort();
  }, [debounced, open]);

  /* ----------------------------- compose items ----------------------------- */

  const items = useMemo<CommandItem[]>(() => {
    const q = query.trim().toLowerCase();

    // Static items: when query is empty, show all. When non-empty, filter
    // by substring on the label.
    const statics = q
      ? STATIC_ITEMS.filter((it) => it.label.toLowerCase().includes(q))
      : STATIC_ITEMS;

    const searchItems: CommandItem[] = [];
    if (results) {
      for (const c of results.clients) {
        searchItems.push({
          id: `client-${c.id}`,
          type: 'client',
          label: c.full_name,
          hint: c.company ?? undefined,
          href: `/admin/clients/${c.id}`,
        });
      }
      for (const l of results.leads) {
        searchItems.push({
          id: `lead-${l.id}`,
          type: 'lead',
          label: l.full_name,
          hint: l.company ?? undefined,
          href: `/admin/leads/${l.id}`,
        });
      }
      for (const p of results.projects) {
        searchItems.push({
          id: `project-${p.id}`,
          type: 'project',
          label: p.name,
          hint: p.contact_name,
          href: `/admin/projects/${p.id}`,
        });
      }
    }

    // Stable order: nav → action → client → project → lead.
    const combined = [...statics, ...searchItems];
    combined.sort((a, b) => groupOrder(a.type) - groupOrder(b.type));
    return combined;
  }, [query, results]);

  // Keep the selected index in range as items shift around.
  useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(items.length === 0 ? 0 : items.length - 1);
    }
  }, [items.length, selectedIndex]);

  /* ----------------------------- execute selection ----------------------------- */

  const execute = useCallback(
    (item: CommandItem) => {
      close();
      router.push(item.href);
    },
    [close, router],
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[selectedIndex];
      if (item) execute(item);
    }
  }

  // Scroll the selected row into view as the user keyboard-navigates.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(
      `[data-index="${selectedIndex}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  /* ----------------------------- render ----------------------------- */

  // Group items for headings while preserving the linear (flat) index used
  // by the selection model.
  const grouped: { type: CommandType; items: { item: CommandItem; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const last = grouped[grouped.length - 1];
    if (last && last.type === item.type) {
      last.items.push({ item, index });
    } else {
      grouped.push({ type: item.type, items: [{ item, index }] });
    }
  });

  return (
    <Dialog
      open={open}
      onClose={close}
      closeOnBackdropClick
      closeOnEscape
      labelledBy="cmdk-title"
      panelClassName="w-full max-w-[600px]"
      className="items-start pt-[12vh]"
    >
      <div
        onKeyDown={onKeyDown}
        className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)]"
      >
        <h2 id="cmdk-title" className="sr-only">
          Command palette
        </h2>

        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0 text-ink-subtle"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search or jump to…"
            className="flex-1 bg-transparent font-sans text-base text-ink placeholder:text-ink-subtle focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-subtle sm:inline">
            ESC
          </kbd>
        </div>

        {/* Results list */}
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Command results"
          className="max-h-[50vh] overflow-y-auto py-2"
        >
          {items.length === 0 ? (
            <li className="px-5 py-10 text-center">
              <p className="font-sans text-sm text-ink-muted">
                No matches. Try a different search.
              </p>
            </li>
          ) : (
            grouped.map((group) => (
              <li key={group.type}>
                <div className="px-5 pb-1 pt-3">
                  <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-ink-subtle">
                    {groupHeading(group.type)}
                  </p>
                </div>
                <ul>
                  {group.items.map(({ item, index }) => {
                    const isSelected = index === selectedIndex;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          data-index={index}
                          onMouseEnter={() => setSelectedIndex(index)}
                          onClick={() => execute(item)}
                          className={cn(
                            'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                            isSelected
                              ? 'bg-copper-soft/50 text-ink'
                              : 'text-ink hover:bg-surface-2/60',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2/60',
                              isSelected
                                ? 'border-copper/30 text-copper'
                                : 'text-ink-subtle',
                            )}
                          >
                            <ItemIcon type={item.type} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-sans text-sm font-medium">
                              {item.label}
                            </span>
                            {item.hint ? (
                              <span className="mt-0.5 block truncate font-sans text-xs text-ink-muted">
                                {item.hint}
                              </span>
                            ) : null}
                          </span>
                          <span className="ml-2 shrink-0 font-mono text-[10px] uppercase tracking-meta-tight text-ink-subtle">
                            {groupLabel(item.type)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>

        {/* Keyboard hint footer */}
        <div className="flex items-center justify-between border-t border-border bg-surface-2/50 px-5 py-2.5">
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-meta-tight text-ink-subtle">
            <span>
              <kbd className="rounded border border-border bg-surface px-1 py-0.5">
                ↵
              </kbd>{' '}
              to open
            </span>
            <span>·</span>
            <span>
              <kbd className="rounded border border-border bg-surface px-1 py-0.5">
                ↑↓
              </kbd>{' '}
              to navigate
            </span>
            <span>·</span>
            <span>
              <kbd className="rounded border border-border bg-surface px-1 py-0.5">
                Esc
              </kbd>{' '}
              to close
            </span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------
 * Topbar trigger button
 *
 * Sits next to the notification bell — clickable affordance that mirrors the
 * keyboard shortcut for discoverability. Dispatches the `cmdk:open` event so
 * we don't have to wire prop-drill between Topbar (server) and the palette.
 * ------------------------------------------------------------------------- */

export function CommandPaletteTrigger() {
  const [shortcut, setShortcut] = useState('Ctrl K');
  useEffect(() => {
    if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)) {
      setShortcut('⌘ K');
    }
  }, []);

  return (
    <button
      type="button"
      aria-label="Open command palette"
      onClick={() => window.dispatchEvent(new CustomEvent('cmdk:open'))}
      className={cn(
        'flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-meta text-ink-muted transition-colors',
        'hover:border-border-strong hover:text-ink',
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <span>{shortcut}</span>
    </button>
  );
}
