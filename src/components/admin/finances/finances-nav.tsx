'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Sub-route nav for the finance section.
 *
 * Real routes rather than client-side tabs, matching the project detail
 * pattern: each view fetches only its own data. The single-page version ran
 * every query on every visit — including the reconciliation matcher — just to
 * show a balance.
 */
const TABS: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: '', label: 'Overview' },
  { slug: 'transactions', label: 'Transactions' },
  { slug: 'reconciliation', label: 'Reconciliation' },
  { slug: 'team', label: 'Team' },
];

export function FinancesNav() {
  const pathname = usePathname() ?? '';
  const base = '/admin/finances';

  return (
    <nav aria-label="Finance sections" className="flex gap-1 border-b border-border">
      {TABS.map((t) => {
        const href = t.slug ? `${base}/${t.slug}` : base;
        // Only the exact path is "active" — otherwise Overview would light up
        // on every child route.
        const active = pathname === href;
        return (
          <Link
            key={t.slug || 'overview'}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 font-sans text-sm transition-colors',
              active
                ? 'border-copper text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
