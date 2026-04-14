'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { slug: '', label: 'Overview' },
  { slug: 'files', label: 'Files' },
  { slug: 'invoices', label: 'Invoices' },
  { slug: 'proposals', label: 'Proposals' },
  { slug: 'messages', label: 'Messages' },
] as const;

export function ClientProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/portal/project/${projectId}`;

  return (
    <nav className="flex items-end gap-1 overflow-x-auto border-b border-border bg-surface/80 px-6 backdrop-blur md:px-10 print:hidden">
      {TABS.map((t) => {
        const href = t.slug ? `${base}/${t.slug}` : base;
        const isActive = t.slug
          ? pathname?.startsWith(href)
          : pathname === base;
        return (
          <Link
            key={t.slug || 'overview'}
            href={href}
            className={cn(
              '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 font-sans text-sm font-medium transition-colors',
              isActive
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
