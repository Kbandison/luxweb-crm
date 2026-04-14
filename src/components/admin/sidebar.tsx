'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Wordmark } from '@/components/brand/wordmark';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { cn } from '@/lib/utils';
import {
  ADMIN_NAV,
  IconAudit,
  IconLogout,
  IconSettings,
} from './nav-items';

export type SidebarProps = {
  userEmail: string;
  userName?: string | null;
};

export function Sidebar({ userEmail, userName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const digit = Number(e.key);
      if (!Number.isInteger(digit)) return;
      const item = ADMIN_NAV.find((n) => n.shortcut === digit);
      if (!item) return;
      e.preventDefault();
      router.push(item.href);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <aside className="relative isolate hidden md:flex md:h-dvh md:w-72 md:flex-col md:self-start md:border-r md:border-border md:bg-gradient-to-b md:from-surface md:via-surface md:to-surface-2 md:sticky md:top-0">
      {/* Left-edge copper hairline */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-copper/80 via-copper/40 to-transparent"
      />

      {/* Brand header */}
      <div className="relative isolate overflow-hidden px-6 pb-6 pt-7">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-12 -top-20 h-52 w-52 rounded-full bg-gradient-to-br from-copper/18 via-gold/8 to-transparent blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px copper-rule"
        />
        <div className="relative">
          <Link href="/admin/dashboard" className="inline-block">
            <Wordmark size="md" />
          </Link>
          <p className="mt-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.28em] text-ink-subtle">
            Portal <span className="text-copper">·</span> CRM
          </p>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1">
        <div className="flex items-center gap-2 px-6 pb-2.5 pt-5">
          <span aria-hidden className="h-2 w-0.5 rounded-full bg-copper" />
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-ink-muted">
            General
          </p>
        </div>
        <nav className="space-y-1 px-3 pb-6">
          {ADMIN_NAV.map((item) => {
            const active =
              item.href === '/admin/dashboard'
                ? pathname === item.href
                : pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group relative flex items-center gap-3 overflow-hidden rounded-md px-3 py-2.5 font-sans text-sm transition-all duration-200',
                  active
                    ? 'bg-gradient-to-r from-copper-soft/55 to-copper-soft/15 text-ink shadow-[inset_0_0_0_1px] shadow-copper/10'
                    : 'text-ink-muted hover:translate-x-0.5 hover:bg-surface/60 hover:text-ink',
                )}
              >
                {active ? (
                  <>
                    <span
                      aria-hidden
                      className="absolute inset-y-1 left-0 w-[3px] rounded-r bg-copper"
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface/40 to-transparent"
                    />
                  </>
                ) : null}
                <Icon
                  className={cn(
                    'h-[18px] w-[18px] shrink-0 transition-colors',
                    active
                      ? 'text-copper'
                      : 'text-ink-subtle group-hover:text-copper/70',
                  )}
                />
                <span className={cn('font-medium', active && 'tracking-tight')}>
                  {item.label}
                </span>
                <kbd
                  className={cn(
                    'ml-auto hidden rounded border border-border bg-surface/70 px-1.5 py-0.5 font-mono text-[10px] tabular-nums transition-all lg:inline',
                    active
                      ? 'border-copper/30 bg-surface text-copper/80'
                      : 'text-ink-subtle group-hover:border-border-strong group-hover:text-ink-muted',
                  )}
                  aria-hidden
                >
                  ⌘{item.shortcut}
                </kbd>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User card with menu */}
      <UserCard userEmail={userEmail} userName={userName} />
    </aside>
  );
}

/* -------------------------------------------------------------------------
 * User card + dropdown menu
 * ------------------------------------------------------------------------- */
function UserCard({ userEmail, userName }: SidebarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleSignOut() {
    setBusy(true);
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
  }

  const displayName = userName ?? userEmail.split('@')[0];

  return (
    <div
      ref={rootRef}
      className="relative isolate border-t border-border px-4 py-4"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-8 left-1/2 h-28 w-56 -translate-x-1/2 rounded-full bg-gradient-to-t from-copper/10 via-transparent to-transparent blur-2xl"
      />

      {/* Menu — absolute above the card */}
      {open ? (
        <div
          role="menu"
          className="absolute inset-x-4 bottom-full mb-2 overflow-hidden rounded-xl border border-border bg-surface shadow-[0_8px_32px_-12px_rgba(0,0,0,0.12)]"
        >
          <Link
            role="menuitem"
            href="/admin/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 font-sans text-sm text-ink transition-colors hover:bg-surface-2"
          >
            <IconSettings className="h-4 w-4 text-ink-subtle" />
            <span className="font-medium">Settings</span>
          </Link>
          <Link
            role="menuitem"
            href="/admin/audit"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 font-sans text-sm text-ink transition-colors hover:bg-surface-2"
          >
            <IconAudit className="h-4 w-4 text-ink-subtle" />
            <span className="font-medium">Audit log</span>
          </Link>
          <div aria-hidden className="h-px bg-border" />
          <button
            role="menuitem"
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left font-sans text-sm text-ink transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            <IconLogout className="h-4 w-4 text-ink-subtle" />
            <span className="font-medium">
              {busy ? 'Signing out…' : 'Sign out'}
            </span>
          </button>
        </div>
      ) : null}

      {/* Trigger */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'relative flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left transition-colors',
          'shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-16px_rgba(180,83,9,0.25)]',
          'hover:border-border-strong',
          open && 'border-copper/30',
        )}
      >
        <div
          className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-copper/30 via-copper-soft/70 to-gold/40 font-mono text-sm font-semibold text-copper ring-1 ring-copper/20"
          aria-hidden
        >
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-black/5" />
          <span className="relative">{displayName.slice(0, 1).toUpperCase()}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-sans text-sm font-medium text-ink">
            {displayName}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="relative inline-flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inset-0 animate-ping rounded-full bg-success/70" />
              <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              Admin · active
            </p>
          </div>
        </div>
        <IconChevron
          className={cn(
            'h-4 w-4 shrink-0 text-ink-subtle transition-transform',
            open && '-rotate-180 text-copper',
          )}
        />
      </button>

      <div className="relative mt-4 flex items-center justify-between px-1">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
          <span className="h-1 w-1 rounded-full bg-copper" aria-hidden />
          dev
        </span>
        <span className="font-mono text-[10px] tabular-nums text-ink-subtle">
          v0.1.0
        </span>
      </div>
    </div>
  );
}

function IconChevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}
