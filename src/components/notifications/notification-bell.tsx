'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatUSD, formatRelative } from '@/lib/formatters';
import { supabaseBrowser } from '@/lib/supabase/browser';

type Notification = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

/** Raw row shape on the `crm.notifications` table — matches the payload
 *  delivered via the postgres_changes channel. */
type NotificationRowDb = {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

/**
 * Reads from `/api/notifications/recent` on mount + on window focus, and
 * subscribes to a Supabase Realtime channel on `crm.notifications` for
 * instant prepends when a row is inserted for the current user. Polling
 * remains as a fallback when Realtime isn't connected so the feature still
 * works without DB replication enabled.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
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

  // Subscribe to Realtime INSERTs scoped to the current user. Falls back
  // to polling-only (see effect below) if subscription doesn't reach the
  // SUBSCRIBED state.
  useEffect(() => {
    let cancelled = false;
    const supabase = supabaseBrowser();

    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function start() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'crm',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload: { new: NotificationRowDb }) => {
            const r = payload.new;
            if (!r || !r.id) {
              // No row data available (e.g. RLS hides payload) — fall back
              // to refetching via the API route.
              void refresh();
              return;
            }
            const next: Notification = {
              id: r.id,
              type: r.type,
              payload: (r.payload ?? {}) as Record<string, unknown>,
              readAt: r.read_at,
              createdAt: r.created_at,
            };
            setItems((prev) => {
              // De-dupe: skip if we already have this id.
              if (prev.some((x) => x.id === next.id)) return prev;
              return [next, ...prev].slice(0, 20);
            });
            if (!r.read_at) setUnread((u) => u + 1);
          },
        )
        .subscribe((status) => {
          if (cancelled) return;
          setRealtimeConnected(status === 'SUBSCRIBED');
        });
    }

    void start();

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
      setRealtimeConnected(false);
    };
  }, [refresh]);

  useEffect(() => {
    void refresh();

    // Poll interval. When Realtime is connected we throttle to 60s as a
    // safety-net (state reconciliation). When it isn't, we keep the prior
    // 30s cadence so behavior is no worse than before.
    let interval: number | null = null;
    function start() {
      if (interval != null) return;
      const ms = realtimeConnected ? 60_000 : 30_000;
      interval = window.setInterval(refresh, ms);
    }
    function stop() {
      if (interval == null) return;
      window.clearInterval(interval);
      interval = null;
    }

    function onFocus() {
      void refresh();
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        void refresh();
        start();
      } else {
        stop();
      }
    }

    // Start polling iff the tab is visible. Pause on hide so background
    // tabs don't burn cycles refreshing.
    if (document.visibilityState === 'visible') start();

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [refresh, realtimeConnected]);

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
    // Only decrement the unread counter when this client's state still
    // thinks the row is unread. Multi-tab races and double-clicks were
    // previously pushing the badge below zero.
    setItems((prev) => {
      let didMark = false;
      const next = prev.map((n) => {
        if (n.id === id && n.readAt === null) {
          didMark = true;
          return { ...n, readAt: new Date().toISOString() };
        }
        return n;
      });
      if (didMark) setUnread((u) => Math.max(0, u - 1));
      return next;
    });
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
        // Mobile: fixed-position the panel beneath the topbar so it spans
        // the viewport with a small margin (anchoring `absolute right-0`
        // to the bell on a narrow phone shoves the w-96 panel off-screen
        // to the left). Tablet+ reverts to the original bell-anchored
        // dropdown.
        <div
          role="dialog"
          className="fixed inset-x-3 top-[4.25rem] z-[60] overflow-hidden rounded-xl border border-border bg-surface shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)] sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
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
                className="font-mono text-[10px] uppercase tracking-meta text-copper transition-colors hover:underline disabled:opacity-50"
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
        <p className="mt-1 font-mono text-[10px] uppercase tracking-meta-tight text-ink-subtle">
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
        href: str('invoicePath')
          ? normalizePath(str('invoicePath'))
          : str('hostedInvoiceUrl') || undefined,
      };
    case 'invoice_paid':
      return {
        title: 'Payment received',
        body: `${str('description')} · ${formatUSD(num('amountCents'))}`,
        href: str('invoicePath')
          ? normalizePath(str('invoicePath'))
          : str('hostedInvoiceUrl') || undefined,
      };
    case 'invoice_overdue':
      return {
        title: 'Invoice overdue',
        body: `${str('description')} · ${formatUSD(num('amountCents'))}`,
        href: str('invoicePath')
          ? normalizePath(str('invoicePath'))
          : str('hostedInvoiceUrl') || undefined,
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
    case 'proposal_accepted_client':
      return {
        title: 'Proposal accepted',
        body: `Thanks — ${str('title')} is in our court next.`,
        href: str('portalPath')
          ? normalizePath(str('portalPath'))
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
    case 'message':
      return {
        title: `${str('senderName') || 'New message'}`,
        body: str('snippet') || undefined,
        href: str('threadPath')
          ? normalizePath(str('threadPath'))
          : undefined,
      };
    case 'invite':
      return {
        title: 'Portal invite sent',
        body: str('email') || undefined,
      };
    case 'new_lead':
      return {
        title: `New lead · ${str('fullName')}`,
        body: str('company') || str('email') || undefined,
        href: str('leadPath')
          ? normalizePath(str('leadPath'))
          : undefined,
      };
    case 'contract_signed':
      return {
        title: `${str('clientName')} signed the contract`,
        body: str('title') || undefined,
        href: str('contractPath')
          ? normalizePath(str('contractPath'))
          : undefined,
      };
    case 'contract_pending_client_signature':
      return {
        title: 'Agreement ready to sign',
        body: 'Counter-signed by LuxWeb · awaiting your signature.',
        href: str('contractPath')
          ? normalizePath(str('contractPath'))
          : undefined,
      };
    case 'revision_requested': {
      const kind = str('kind');
      const isComment = kind === 'comment';
      return {
        title: isComment
          ? `${str('clientName')} replied · ${str('title')}`
          : `Review needed · ${str('title')}`,
        body: str('bodySnippet') || str('projectName') || undefined,
        href: str('revisionPath')
          ? normalizePath(str('revisionPath'))
          : undefined,
      };
    }
    case 'revision_updated': {
      const kind = str('kind');
      return {
        title:
          kind === 'status'
            ? `Status updated · ${str('title')}`
            : `New reply · ${str('title')}`,
        body:
          kind === 'status'
            ? str('statusLabel') || str('projectName') || undefined
            : str('snippet') || str('projectName') || undefined,
        href: str('revisionPath')
          ? normalizePath(str('revisionPath'))
          : undefined,
      };
    }
    case 'care_plan_activated':
      return {
        title: 'Care plan activated',
        body:
          str('projectName') ||
          (num('amountCents') > 0
            ? `${formatUSD(num('amountCents'))}/${str('interval') || 'month'}`
            : undefined),
        href: str('portalPath')
          ? normalizePath(str('portalPath'))
          : undefined,
      };
    case 'project_completed':
      return {
        title: `${str('projectName')} is complete`,
        body: 'Would you leave a quick review?',
        href: str('projectPath')
          ? normalizePath(str('projectPath'))
          : undefined,
      };
    case 'payment_received':
      return {
        title: `Payment received · ${str('clientName')}`,
        body: `${str('description')} · ${formatUSD(num('amountCents'))}`,
        href: str('invoicePath')
          ? normalizePath(str('invoicePath'))
          : undefined,
      };
    case 'payment_overdue':
      return {
        title: `Payment overdue · ${str('clientName')}`,
        body: `${str('description')} · ${formatUSD(num('amountCents'))}`,
        href: str('invoicePath')
          ? normalizePath(str('invoicePath'))
          : undefined,
      };
    default:
      return { title: n.type.replace(/_/g, ' ') };
  }
}

function normalizePath(p: string): string {
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  return p.startsWith('/') ? p : `/${p}`;
}

