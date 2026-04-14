'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Wordmark } from '@/components/brand/wordmark';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { cn } from '@/lib/utils';
import { ADMIN_NAV, IconAudit, IconLogout, IconSettings } from './nav-items';

export type MobileNavProps = {
  userEmail: string;
  userName?: string | null;
};

/**
 * Mobile-only admin header (md:hidden). Hamburger opens a full-height
 * drawer from the left with the same nav items as the desktop sidebar,
 * plus Settings / Audit log / Sign out.
 */
export function MobileNav({ userEmail, userName }: MobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  async function handleSignOut() {
    setBusy(true);
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
  }

  const displayName = userName ?? userEmail.split('@')[0];

  return (
    <>
      {/* Sticky mobile header — above the page Topbar. md+ hides this entirely. */}
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur md:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-ink transition-colors hover:bg-surface-2"
        >
          <IconMenu className="h-5 w-5" />
        </button>
        <Link
          href="/admin/dashboard"
          className="flex items-center"
          aria-label="LuxWeb dashboard"
        >
          <Wordmark size="sm" />
        </Link>
        <span aria-hidden className="h-9 w-9" />
      </header>

      {/* Drawer + backdrop */}
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Admin navigation"
          className="fixed inset-0 z-[70] md:hidden"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/70"
          />

          {/* Panel */}
          <aside
            className={cn(
              'relative flex h-full w-[82%] max-w-sm flex-col',
              'border-r border-border bg-gradient-to-b from-surface via-surface to-surface-2',
              'shadow-[0_0_64px_-16px_rgba(0,0,0,0.4)]',
              'animate-in slide-in-from-left duration-200',
            )}
          >
            {/* Left-edge copper hairline */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-copper/80 via-copper/40 to-transparent"
            />

            {/* Header */}
            <div className="relative isolate overflow-hidden px-5 pb-5 pt-5">
              <div
                aria-hidden
                className="pointer-events-none absolute -left-12 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-copper/18 via-gold/8 to-transparent blur-2xl"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-px copper-rule"
              />
              <div className="relative flex items-center justify-between">
                <Link href="/admin/dashboard" onClick={() => setOpen(false)}>
                  <Wordmark size="md" />
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close navigation"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <IconClose className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-ink-subtle">
                Portal <span className="text-copper">·</span> CRM
              </p>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto px-3 pb-4">
              <div className="flex items-center gap-2 px-3 pb-2.5 pt-4">
                <span aria-hidden className="h-2 w-0.5 rounded-full bg-copper" />
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-ink-muted">
                  General
                </p>
              </div>
              <ul className="space-y-1">
                {ADMIN_NAV.map((item) => {
                  const active =
                    item.href === '/admin/dashboard'
                      ? pathname === item.href
                      : pathname?.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'relative flex items-center gap-3 rounded-md px-3 py-2.5 font-sans text-sm transition-colors',
                          active
                            ? 'bg-gradient-to-r from-copper-soft/55 to-copper-soft/15 text-ink shadow-[inset_0_0_0_1px] shadow-copper/10'
                            : 'text-ink-muted hover:bg-surface/60 hover:text-ink',
                        )}
                      >
                        {active ? (
                          <span
                            aria-hidden
                            className="absolute inset-y-1 left-0 w-[3px] rounded-r bg-copper"
                          />
                        ) : null}
                        <Icon
                          className={cn(
                            'h-[18px] w-[18px] shrink-0',
                            active ? 'text-copper' : 'text-ink-subtle',
                          )}
                        />
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center gap-2 px-3 pb-2.5 pt-6">
                <span aria-hidden className="h-2 w-0.5 rounded-full bg-copper" />
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-ink-muted">
                  Workspace
                </p>
              </div>
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/admin/settings"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 font-sans text-sm text-ink-muted transition-colors hover:bg-surface/60 hover:text-ink"
                  >
                    <IconSettings className="h-[18px] w-[18px] shrink-0 text-ink-subtle" />
                    <span className="font-medium">Settings</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/admin/audit"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 font-sans text-sm text-ink-muted transition-colors hover:bg-surface/60 hover:text-ink"
                  >
                    <IconAudit className="h-[18px] w-[18px] shrink-0 text-ink-subtle" />
                    <span className="font-medium">Audit log</span>
                  </Link>
                </li>
              </ul>
            </nav>

            {/* User footer + sign out */}
            <div className="border-t border-border px-4 py-4">
              <div className="flex items-center gap-3">
                <div
                  className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-copper/30 via-copper-soft/70 to-gold/40 font-mono text-sm font-semibold text-copper ring-1 ring-copper/20"
                  aria-hidden
                >
                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-black/5" />
                  <span className="relative">
                    {displayName.slice(0, 1).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-sm font-medium text-ink">
                    {displayName}
                  </p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                    {userEmail}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={busy}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 font-sans text-sm font-medium text-ink transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-50"
              >
                <IconLogout className="h-4 w-4 text-ink-subtle" />
                {busy ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
