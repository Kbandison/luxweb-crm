'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { buildListSearch, totalPages } from '@/lib/list-params';
import { cn } from '@/lib/utils';

/**
 * Pagination footer for admin list pages. URL-driven — clicking Previous /
 * Next links to the same path with `?page=` updated. All other query params
 * (`sort`, `dir`, `q`, etc.) are preserved.
 */
export function PaginationFooter({
  page,
  pageSize,
  totalCount,
  searchParams,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  /** Current URL search params, used to preserve unrelated state. */
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const pathname = usePathname();
  const pages = totalPages(totalCount, pageSize);

  const { prevHref, nextHref } = useMemo(() => {
    const buildHref = (target: number) => {
      const search = buildListSearch(searchParams, {
        page: target === 1 ? null : String(target),
      });
      return search ? `${pathname}?${search}` : pathname;
    };
    return {
      prevHref: buildHref(Math.max(1, page - 1)),
      nextHref: buildHref(Math.min(pages, page + 1)),
    };
  }, [pathname, searchParams, page, pages]);

  const onFirst = page <= 1;
  const onLast = page >= pages;

  const showingFrom = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-6 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
        {totalCount === 0
          ? 'No results'
          : `Showing ${showingFrom}–${showingTo} of ${totalCount}`}
      </p>
      <nav
        aria-label="Pagination"
        className="flex items-center gap-1"
      >
        <PageLink href={prevHref} disabled={onFirst} label="Prev" rel="prev" />
        <span className="px-3 font-mono text-[10px] uppercase tracking-[0.18em] tabular-nums text-ink-muted">
          Page {page} of {pages}
        </span>
        <PageLink href={nextHref} disabled={onLast} label="Next" rel="next" />
      </nav>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  rel,
}: {
  href: string;
  disabled: boolean;
  label: string;
  rel?: 'prev' | 'next';
}) {
  const baseClass =
    'rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em]';

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={cn(baseClass, 'text-ink-subtle opacity-50')}
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      rel={rel}
      prefetch={false}
      className={cn(
        baseClass,
        'text-ink-muted transition-colors hover:border-border-strong hover:text-ink',
      )}
    >
      {label}
    </Link>
  );
}
