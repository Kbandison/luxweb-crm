'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Tab nav for a contractor's assigned-project view. Kept minimal — the
 * staff surface is delivery-only (overview, files, messages, time).
 */
const TABS: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: '', label: 'Overview' },
  { slug: 'files', label: 'Files' },
  { slug: 'messages', label: 'Messages' },
];

export function StaffProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/staff/projects/${projectId}`;

  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-b border-border px-6">
      {TABS.map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const active = tab.slug
          ? pathname?.startsWith(href)
          : pathname === base;
        return (
          <Link
            key={tab.slug || 'overview'}
            href={href}
            className={cn(
              'relative -mb-px whitespace-nowrap border-b-2 px-3 py-3 font-sans text-sm font-medium transition-colors',
              active
                ? 'border-copper text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
