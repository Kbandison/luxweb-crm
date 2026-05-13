'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { buildListSearch, type SortDir } from '@/lib/list-params';
import { cn } from '@/lib/utils';

/**
 * Clickable column header that links to the same path with `?sort=` set to
 * `field` and `?dir=` toggled. Clicking a non-active column resets to `desc`
 * (newest / largest first feels right by default for most CRM lists).
 *
 * Sorting resets `?page` to 1 so the user lands on the first page of the new
 * ordering rather than a possibly-empty offset.
 */
export function SortableHeader({
  field,
  label,
  currentSort,
  currentDir,
  searchParams,
  align = 'left',
  className,
}: {
  field: string;
  label: string;
  currentSort: string;
  currentDir: SortDir;
  searchParams: Record<string, string | string[] | undefined>;
  align?: 'left' | 'right';
  className?: string;
}) {
  const pathname = usePathname();
  const isActive = currentSort === field;

  const href = useMemo(() => {
    const nextDir: SortDir =
      isActive && currentDir === 'desc' ? 'asc' : isActive ? 'desc' : 'desc';
    const search = buildListSearch(searchParams, {
      sort: field,
      dir: nextDir,
      page: null, // reset to page 1 on sort change
    });
    return search ? `${pathname}?${search}` : pathname;
  }, [pathname, searchParams, field, isActive, currentDir]);

  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
      aria-sort={
        isActive
          ? currentDir === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none'
      }
      className={cn(
        'inline-flex items-center gap-1 rounded font-mono text-[10px] uppercase tracking-meta transition-colors',
        isActive ? 'text-ink' : 'text-ink-muted hover:text-ink',
        align === 'right' && 'flex-row-reverse',
        className,
      )}
    >
      <span>{label}</span>
      <SortArrow active={isActive} dir={currentDir} />
    </Link>
  );
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return (
      <span aria-hidden className="text-ink-subtle opacity-50">
        {'↕'}
      </span>
    );
  }
  return (
    <span aria-hidden className="text-copper">
      {dir === 'asc' ? '▲' : '▼'}
    </span>
  );
}
