'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ContactRow } from '@/lib/queries/admin';
import { STAGES, STAGE_LABEL } from './stage-meta';

export function NewDealDrawer({ contacts }: { contacts: ContactRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contactId, setContactId] = useState('');
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState<(typeof STAGES)[number]>('lead');
  const [valueDollars, setValueDollars] = useState('');
  const [probability, setProbability] = useState('0');
  const [expectedClose, setExpectedClose] = useState('');

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open]);

  function reset() {
    setContactId('');
    setTitle('');
    setStage('lead');
    setValueDollars('');
    setProbability('0');
    setExpectedClose('');
    setError(null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const dollars = Number(valueDollars) || 0;
      const res = await fetch('/api/admin/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contactId,
          title,
          stage,
          value_cents: Math.max(0, Math.round(dollars * 100)),
          probability: Math.max(0, Math.min(100, Number(probability) || 0)),
          expected_close: expectedClose || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to create deal.');
        setBusy(false);
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        size="sm"
        className="gap-1.5"
        disabled={contacts.length === 0}
        title={contacts.length === 0 ? 'Add a lead first' : undefined}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New deal
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      <aside
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md transform flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="relative isolate overflow-hidden border-b border-border px-6 pb-5 pt-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-copper/20 via-gold/10 to-transparent blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px copper-rule"
          />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-copper">
                New deal
              </p>
              <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-ink">
                Open a deal
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-md border border-border bg-surface p-2 text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
            <div className="space-y-1.5">
              <Label htmlFor="contact_id">Contact</Label>
              <select
                id="contact_id"
                required
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink font-sans focus-visible:outline-none focus-visible:border-copper focus-visible:ring-2 focus-visible:ring-copper/30"
              >
                <option value="">Select a contact…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                    {c.company ? ` · ${c.company}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">Deal title</Label>
              <Input
                id="title"
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Signature site rebuild"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stage">Stage</Label>
                <select
                  id="stage"
                  value={stage}
                  onChange={(e) =>
                    setStage(e.target.value as (typeof STAGES)[number])
                  }
                  className="flex h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink font-sans focus-visible:outline-none focus-visible:border-copper focus-visible:ring-2 focus-visible:ring-copper/30"
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="value">Value (USD)</Label>
                <Input
                  id="value"
                  type="number"
                  min={0}
                  step="100"
                  value={valueDollars}
                  onChange={(e) => setValueDollars(e.target.value)}
                  placeholder="5000"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="probability">Probability (0–100)</Label>
                <Input
                  id="probability"
                  type="number"
                  min={0}
                  max={100}
                  value={probability}
                  onChange={(e) => setProbability(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expected_close">Expected close</Label>
                <Input
                  id="expected_close"
                  type="date"
                  value={expectedClose}
                  onChange={(e) => setExpectedClose(e.target.value)}
                />
              </div>
            </div>

            {error ? (
              <p role="alert" className="font-sans text-xs text-danger">
                {error}
              </p>
            ) : null}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busy || !contactId || !title.trim()}
            >
              {busy ? 'Saving…' : 'Open deal'}
            </Button>
          </footer>
        </form>
      </aside>
    </>
  );
}
