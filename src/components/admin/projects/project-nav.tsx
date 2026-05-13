'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ACTIVE_TAB_ATTR = 'data-active';

type Tab = {
  slug: string;
  label: string;
  adminOnly?: boolean;
  group: 'primary' | 'docs';
};

// Day-to-day workflow tabs go primary; reference material lives in the Docs
// dropdown so the row stays scannable.
const TABS: readonly Tab[] = [
  { slug: '', label: 'Overview', group: 'primary' },
  { slug: 'milestones', label: 'Milestones', group: 'primary' },
  { slug: 'invoices', label: 'Invoices', group: 'primary' },
  { slug: 'revisions', label: 'Revisions', group: 'primary' },
  { slug: 'messages', label: 'Messages', group: 'primary' },
  { slug: 'agreement', label: 'Agreement', group: 'docs' },
  { slug: 'credentials', label: 'Credentials', group: 'docs' },
  { slug: 'files', label: 'Files', group: 'docs' },
];

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/admin/projects/${projectId}`;
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const primaryTabs = TABS.filter((t) => t.group === 'primary');
  const docsTabs = TABS.filter((t) => t.group === 'docs');

  const isDocsActive = docsTabs.some((t) =>
    pathname?.startsWith(`${base}/${t.slug}`),
  );

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (
        dropdownRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Close the dropdown when navigating to one of its entries.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Scroll the active tab into view if the nav has horizontal overflow.
  // Without this, the active tab can be off-screen when the route changes
  // and the user sees a row that looks like nothing is selected.
  const scrollerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const active = scroller.querySelector<HTMLElement>(`[${ACTIVE_TAB_ATTR}]`);
    if (active) {
      active.scrollIntoView({
        behavior: 'instant',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [pathname]);

  return (
    <div className="relative border-b border-border bg-surface print:hidden">
      <nav
        ref={scrollerRef}
        className="flex items-end gap-1 overflow-x-auto px-8"
      >
        {primaryTabs.map((t) => {
          const href = t.slug ? `${base}/${t.slug}` : base;
          const isActive = t.slug
            ? pathname?.startsWith(href)
            : pathname === base;
          return (
            <Link
              key={t.slug || 'overview'}
              href={href}
              {...(isActive ? { [ACTIVE_TAB_ATTR]: 'true' } : {})}
              className={cn(
                '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 font-sans text-sm font-medium transition-colors',
                isActive
                  ? 'border-copper text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              {t.label}
              {t.adminOnly ? (
                <span
                  className="rounded bg-copper-soft/60 px-1 font-mono text-[9px] uppercase tracking-wide text-copper"
                  title="Admin only"
                >
                  Admin
                </span>
              ) : null}
            </Link>
          );
        })}

        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={open}
            className={cn(
              '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 font-sans text-sm font-medium transition-colors',
              isDocsActive || open
                ? 'border-copper text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            Docs
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(
                'h-3 w-3 transition-transform',
                open && 'rotate-180',
              )}
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {open ? (
            <div
              ref={dropdownRef}
              role="menu"
              className="absolute left-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-md border border-border bg-surface shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]"
            >
              {docsTabs.map((t) => {
                const href = `${base}/${t.slug}`;
                const isActive = pathname?.startsWith(href);
                return (
                  <Link
                    key={t.slug}
                    href={href}
                    role="menuitem"
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left font-sans text-sm transition-colors',
                      isActive
                        ? 'bg-copper-soft/50 text-ink'
                        : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </nav>
      {/* Right-edge fade hints at off-screen tabs when the nav scrolls. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent"
      />
    </div>
  );
}
