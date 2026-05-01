'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type TabKey = 'profile' | 'notifications' | 'integrations';

type Prefs = Record<string, boolean>;

type IntegrationStatus = {
  supabase: boolean;
  stripe: boolean;
  resend: boolean;
};

const PREFS: Array<{ key: string; label: string; description: string }> = [
  {
    key: 'message',
    label: 'New messages',
    description: 'Email when a client replies in a project thread.',
  },
  {
    key: 'invoice_sent',
    label: 'Invoice sent',
    description: 'Email when an invoice is dispatched via Stripe.',
  },
  {
    key: 'invoice_paid',
    label: 'Payment received',
    description: 'Email when a client payment clears.',
  },
  {
    key: 'proposal_sent',
    label: 'Proposal sent',
    description: 'Email when a proposal is shared with a client.',
  },
  {
    key: 'contract_signed',
    label: 'Contract signed',
    description: 'Email when a client counter-signs the agreement.',
  },
  {
    key: 'milestone_updated',
    label: 'Milestone update',
    description: 'Email when a milestone changes state.',
  },
  {
    key: 'revision_requested',
    label: 'Revision request',
    description:
      'Email when a client files a revision or replies on one.',
  },
];

const DEFAULTS: Prefs = {
  message: true,
  invoice_sent: true,
  invoice_paid: true,
  proposal_sent: true,
  contract_signed: true,
  milestone_updated: true,
  revision_requested: true,
};

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'profile', label: 'Profile' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'integrations', label: 'Integrations' },
];

export function AdminSettingsTabs({
  initialTab,
  initialFullName,
  email,
  initialPrefs,
  integrations,
}: {
  initialTab: TabKey;
  initialFullName: string;
  email: string;
  initialPrefs: Prefs;
  integrations: IntegrationStatus;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [fullName, setFullName] = useState(initialFullName);
  const [prefs, setPrefs] = useState<Prefs>({ ...DEFAULTS, ...initialPrefs });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to save.');
        return;
      }
      setSavedAt(new Date());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function changeTab(next: TabKey) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url.toString());
  }

  return (
    <div className="space-y-6">
      {/* Tab strip */}
      <nav
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1 border-b border-border"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => changeTab(t.key)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 font-sans text-sm transition-colors',
              tab === t.key
                ? 'border-copper text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'profile' ? (
        <ProfileTab
          fullName={fullName}
          setFullName={setFullName}
          email={email}
          busy={busy}
          onSave={() => save({ full_name: fullName.trim() })}
        />
      ) : null}

      {tab === 'notifications' ? (
        <NotificationsTab
          prefs={prefs}
          setPrefs={setPrefs}
          busy={busy}
          onSave={() => save({ email_prefs: prefs })}
        />
      ) : null}

      {tab === 'integrations' ? (
        <IntegrationsTab integrations={integrations} />
      ) : null}

      {/* Save status — only for editable tabs */}
      {tab !== 'integrations' ? (
        <div className="flex items-center justify-end">
          {busy ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper">
              Saving…
            </p>
          ) : error ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-danger">
              {error}
            </p>
          ) : savedAt ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-success">
              Saved {savedAt.toLocaleTimeString()}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProfileTab({
  fullName,
  setFullName,
  email,
  busy,
  onSave,
}: {
  fullName: string;
  setFullName: (v: string) => void;
  email: string;
  busy: boolean;
  onSave: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="space-y-6 rounded-xl border border-border bg-surface p-6"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="admin_full_name">Full name</Label>
          <Input
            id="admin_full_name"
            required
            maxLength={200}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin_email">Email</Label>
          <Input id="admin_email" value={email} disabled readOnly />
          <p className="font-sans text-xs text-ink-subtle">
            Your login email. Change it through Supabase auth if needed.
          </p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </form>
  );
}

function NotificationsTab({
  prefs,
  setPrefs,
  busy,
  onSave,
}: {
  prefs: Prefs;
  setPrefs: (fn: (curr: Prefs) => Prefs) => void;
  busy: boolean;
  onSave: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="space-y-5"
    >
      <p className="font-sans text-sm text-ink-muted">
        Admin notifications always appear in the bell menu. These toggle whether
        they also reach your inbox.
      </p>
      <ul className="overflow-hidden rounded-xl border border-border bg-surface">
        {PREFS.map((p, i) => (
          <li
            key={p.key}
            className={cn(
              'flex items-start gap-4 px-5 py-4',
              i > 0 && 'border-t border-border',
            )}
          >
            <label className="flex flex-1 items-start gap-4">
              <input
                type="checkbox"
                checked={prefs[p.key] ?? true}
                onChange={(e) =>
                  setPrefs((curr) => ({ ...curr, [p.key]: e.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded border-border accent-copper"
              />
              <div className="min-w-0 flex-1">
                <p className="font-sans text-sm font-medium text-ink">
                  {p.label}
                </p>
                <p className="mt-0.5 font-sans text-xs text-ink-muted">
                  {p.description}
                </p>
              </div>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save preferences'}
        </Button>
      </div>
    </form>
  );
}

function IntegrationsTab({ integrations }: { integrations: IntegrationStatus }) {
  const rows: Array<{
    key: keyof IntegrationStatus;
    label: string;
    description: string;
  }> = [
    {
      key: 'supabase',
      label: 'Supabase',
      description: 'Auth, database, storage. Service role key required.',
    },
    {
      key: 'stripe',
      label: 'Stripe',
      description: 'Invoicing + webhook signature verification.',
    },
    {
      key: 'resend',
      label: 'Resend',
      description: 'Transactional email delivery.',
    },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {rows.map((r, i) => {
        const connected = integrations[r.key];
        return (
          <div
            key={r.key}
            className={cn(
              'flex items-start justify-between gap-4 px-5 py-4',
              i > 0 && 'border-t border-border',
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="font-sans text-sm font-medium text-ink">
                {r.label}
              </p>
              <p className="mt-0.5 font-sans text-xs text-ink-muted">
                {r.description}
              </p>
            </div>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em]',
                connected
                  ? 'bg-success/15 text-success'
                  : 'bg-warning/15 text-warning',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  connected ? 'bg-success' : 'bg-warning',
                )}
              />
              {connected ? 'Connected' : 'Not configured'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
