'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/staff/dashboard', label: 'Projects' },
  { href: '/staff/leads', label: 'My leads' },
];

export function StaffNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active = pathname?.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'rounded-md px-3 py-1.5 font-sans text-sm font-medium transition-colors',
              active
                ? 'bg-surface-2 text-ink'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
