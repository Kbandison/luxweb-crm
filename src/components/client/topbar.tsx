'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Wordmark } from '@/components/brand/wordmark';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { cn } from '@/lib/utils';

export type ClientTopbarProps = {
  userEmail: string;
  userName?: string | null;
};

const NAV = [
  { href: '/portal/dashboard', label: 'Dashboard' },
  { href: '/portal/profile', label: 'Profile' },
];

export function ClientTopbar({ userEmail, userName }: ClientTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  async function signOut() {
    setBusy(true);
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
  }

  const displayName = userName ?? userEmail.split('@')[0];

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur print:hidden">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-6 md:px-10">
        <Link href="/portal/dashboard" className="shrink-0">
          <Wordmark size="sm" />
        </Link>

        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-md px-3 py-1.5 font-sans text-sm font-medium transition-colors',
                  active
                    ? 'bg-copper-soft/50 text-ink'
                    : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <NotificationBell />

          {/* User menu */}
          <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={cn(
              'flex items-center gap-2.5 rounded-full border border-border bg-surface py-1 pl-1 pr-3 transition-colors',
              menuOpen
                ? 'border-copper/30'
                : 'hover:border-border-strong',
            )}
          >
            <span
              aria-hidden
              className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-copper/30 via-copper-soft/70 to-gold/40 font-mono text-[11px] font-semibold text-copper ring-1 ring-copper/20"
            >
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-black/5" />
              <span className="relative">
                {displayName.slice(0, 1).toUpperCase()}
              </span>
            </span>
            <span className="hidden font-sans text-sm font-medium text-ink sm:inline">
              {displayName}
            </span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(
                'h-3.5 w-3.5 text-ink-subtle transition-transform',
                menuOpen && 'rotate-180 text-copper',
              )}
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)]"
            >
              <div className="border-b border-border px-3 py-2.5">
                <p className="truncate font-sans text-sm font-medium text-ink">
                  {displayName}
                </p>
                <p className="truncate font-mono text-[11px] text-ink-subtle">
                  {userEmail}
                </p>
              </div>
              <Link
                role="menuitem"
                href="/portal/profile"
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2.5 font-sans text-sm text-ink transition-colors hover:bg-surface-2"
              >
                Profile & email
              </Link>
              <div aria-hidden className="h-px bg-border" />
              <button
                role="menuitem"
                type="button"
                onClick={signOut}
                disabled={busy}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left font-sans text-sm text-ink transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                <span>{busy ? 'Signing out…' : 'Sign out'}</span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 text-ink-subtle"
                  aria-hidden
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
