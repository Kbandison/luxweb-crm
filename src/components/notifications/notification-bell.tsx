'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatUSD, formatRelative } from '@/lib/formatters';

type Notification = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

/**
 * Reads from `/api/notifications/recent` on mount + on window focus.
 * Upgrades trivially to Supabase Realtime once RLS + replication are
 * configured — swap the poll for a channel subscription.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/recent', {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const j = (await res.json()) as {
        notifications: Notification[];
        unread: number;
      };
      setItems(j.notifications);
      setUnread(j.unread);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    void refresh();
    function onFocus() {
      void refresh();
    }
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  async function markAllRead() {
    setLoading(true);
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      setItems((prev) =>
        prev.map((n) => ({
          ...n,
          readAt: n.readAt ?? new Date().toISOString(),
        })),
      );
      setUnread(0);
    } finally {
      setLoading(false);
    }
  }

  async function markOneRead(id: string) {
    // Optimistic
    setItems((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, readAt: n.readAt ?? new Date().toISOString() }
          : n,
      ),
    );
    setUnread((u) => Math.max(0, u - 1));
    await fetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-ink-muted transition-colors',
          open
            ? 'border-copper/30 text-ink'
            : 'hover:border-border-strong hover:text-ink',
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 ? (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-copper px-1 font-mono text-[9px] font-semibold tabular-nums text-copper-foreground ring-2 ring-surface"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          className="absolute right-0 top-full z-40 mt-2 w-96 overflow-hidden rounded-xl border border-border bg-surface shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)]"
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="font-display text-sm font-medium text-ink">
              Notifications
            </p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                disabled={loading}
                className="font-mono text-[10px] uppercase tracking-[0.16em] text-copper transition-colors hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            ) : null}
          </header>

          {items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="font-sans text-sm text-ink-muted">
                No updates. Anything new will appear here.
              </p>
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-border">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationItem
                    n={n}
                    onClose={() => setOpen(false)}
                    onMarkRead={markOneRead}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------- item + deep links --------------------------- */

function NotificationItem({
  n,
  onClose,
  onMarkRead,
}: {
  n: Notification;
  onClose: () => void;
  onMarkRead: (id: string) => void;
}) {
  const info = describe(n);
  const unread = n.readAt === null;

  const body = (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50',
        unread && 'bg-copper-soft/15',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
          unread ? 'bg-copper' : 'bg-transparent',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="font-sans text-sm font-medium text-ink">{info.title}</p>
        {info.body ? (
          <p className="mt-0.5 truncate font-sans text-xs text-ink-muted">
            {info.body}
          </p>
        ) : null}
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
          {formatRelative(n.createdAt)}
        </p>
      </div>
    </div>
  );

  if (info.href) {
    return (
      <Link
        href={info.href}
        onClick={() => {
          if (unread) onMarkRead(n.id);
          onClose();
        }}
      >
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (unread) onMarkRead(n.id);
      }}
      className="block w-full text-left"
    >
      {body}
    </button>
  );
}

type Described = { title: string; body?: string; href?: string };

function describe(n: Notification): Described {
  const p = n.payload as Record<string, unknown>;
  const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
  const num = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : 0);

  switch (n.type) {
    case 'invoice_sent':
      return {
        title: 'New invoice',
        body: str('description') || formatUSD(num('amountCents')),
        href: str('hostedInvoiceUrl') || undefined,
      };
    case 'invoice_paid':
      return {
        title: 'Payment received',
        body: `${str('description')} · ${formatUSD(num('amountCents'))}`,
        href: str('hostedInvoiceUrl') || undefined,
      };
    case 'proposal_sent':
      return {
        title: 'Proposal ready',
        body: str('title'),
        href: str('proposalPath')
          ? normalizePath(str('proposalPath'))
          : undefined,
      };
    case 'proposal_accepted':
      return {
        title: 'Proposal accepted',
        body: `${str('clientName')} signed ${str('title')}`,
        href: str('proposalPath')
          ? normalizePath(str('proposalPath'))
          : undefined,
      };
    case 'milestone_updated':
      return {
        title: 'Milestone update',
        body: `${str('milestoneTitle')} · ${str('status')}`,
        href: str('projectPath')
          ? normalizePath(str('projectPath'))
          : undefined,
      };
    case 'invite':
      return {
        title: 'Portal invite sent',
        body: str('email') || undefined,
      };
    default:
      return { title: n.type.replace(/_/g, ' ') };
  }
}

function normalizePath(p: string): string {
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  return p.startsWith('/') ? p : `/${p}`;
}

