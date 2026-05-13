'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

type Tab = { slug: string; label: string; adminOnly?: boolean };

const TABS: readonly Tab[] = [
  { slug: '', label: 'Overview' },
  { slug: 'milestones', label: 'Milestones' },
  { slug: 'time', label: 'Time', adminOnly: true },
  { slug: 'files', label: 'Files' },
  { slug: 'messages', label: 'Messages' },
  { slug: 'agreement', label: 'Agreement' },
  { slug: 'credentials', label: 'Credentials' },
  { slug: 'invoices', label: 'Invoices' },
  { slug: 'revisions', label: 'Revisions' },
];

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/admin/projects/${projectId}`;

  return (
    <div className="relative border-b border-border bg-surface print:hidden">
      <nav className="flex items-end gap-1 overflow-x-auto px-8">
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
      </nav>
      {/* Right-edge fade hints at off-screen tabs when the nav scrolls. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent"
      />
    </div>
  );
}
