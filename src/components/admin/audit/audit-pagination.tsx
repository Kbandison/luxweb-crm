'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

export function AuditPagination({
  page,
  totalPages,
  total,
  pageSize,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}) {
  const sp = useSearchParams();

  function hrefFor(p: number) {
    const next = new URLSearchParams(sp.toString());
    if (p === 1) next.delete('page');
    else next.set('page', String(p));
    return next.toString() ? `/admin/audit?${next.toString()}` : '/admin/audit';
  }

  const showingFrom = (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
        {total === 0
          ? 'No results'
          : `Showing ${showingFrom}–${showingTo} of ${total}`}
      </p>
      <nav className="flex items-center gap-1">
        <PageLink
          href={hrefFor(Math.max(1, page - 1))}
          disabled={page <= 1}
          label="Prev"
        />
        <span className="px-3 font-mono text-[11px] tabular-nums text-ink-muted">
          Page {page} of {totalPages}
        </span>
        <PageLink
          href={hrefFor(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          label="Next"
        />
      </nav>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
}: {
  href: string;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle opacity-50"
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        'rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted transition-colors',
        'hover:border-border-strong hover:text-ink',
      )}
    >
      {label}
    </Link>
  );
}
