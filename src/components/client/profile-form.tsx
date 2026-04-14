'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Prefs = Record<string, boolean>;

const PREF_LABELS: Array<{
  key: keyof typeof DEFAULTS;
  label: string;
  description: string;
}> = [
  {
    key: 'message',
    label: 'New messages',
    description: 'When the team sends you a message in the portal.',
  },
  {
    key: 'invoice_sent',
    label: 'New invoices',
    description: 'When a new invoice is ready for payment.',
  },
  {
    key: 'invoice_paid',
    label: 'Payment receipts',
    description: 'Confirmation when a payment is successfully processed.',
  },
  {
    key: 'proposal_sent',
    label: 'New proposals',
    description: 'When a proposal is ready for your review.',
  },
  {
    key: 'milestone_updated',
    label: 'Milestone updates',
    description: 'When a project milestone is completed or changes status.',
  },
];

const DEFAULTS = {
  message: true,
  invoice_sent: true,
  invoice_paid: true,
  proposal_sent: true,
  milestone_updated: true,
} as const;

export function ClientProfileForm({
  initialFullName,
  email,
  initialPrefs,
}: {
  initialFullName: string;
  email: string;
  initialPrefs: Prefs;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialFullName);
  const [prefs, setPrefs] = useState<Prefs>({ ...DEFAULTS, ...initialPrefs });
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/client/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email_prefs: prefs,
        }),
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

  return (
    <form onSubmit={save} className="space-y-10">
      {/* Identity */}
      <section className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-semibold tabular-nums text-copper">
            01
          </span>
          <span aria-hidden className="h-3.5 w-px bg-copper/40" />
          <h2 className="font-display text-lg font-medium tracking-tight text-ink">
            Identity
          </h2>
        </div>
        <div className="grid gap-4 rounded-xl border border-border bg-surface p-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              required
              maxLength={200}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} disabled readOnly />
            <p className="font-sans text-xs text-ink-subtle">
              Contact the team to change your login email.
            </p>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-semibold tabular-nums text-copper">
            02
          </span>
          <span aria-hidden className="h-3.5 w-px bg-copper/40" />
          <h2 className="font-display text-lg font-medium tracking-tight text-ink">
            Email notifications
          </h2>
        </div>
        <p className="font-sans text-sm text-ink-muted">
          Every notification always shows in the portal. These toggle whether
          you also get an email.
        </p>
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {PREF_LABELS.map((p, i) => (
            <li
              key={p.key}
              className={`flex items-start gap-4 px-5 py-4 ${i > 0 ? 'border-t border-border' : ''}`}
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
      </section>

      {/* Save bar */}
      <div className="sticky bottom-6 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/95 px-5 py-3 backdrop-blur">
        <div>
          {busy ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper">
              Saving…
            </p>
          ) : savedAt ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-success">
              Saved {savedAt.toLocaleTimeString()}
            </p>
          ) : error ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-danger">
              {error}
            </p>
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
              Unsaved changes save on submit
            </p>
          )}
        </div>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
