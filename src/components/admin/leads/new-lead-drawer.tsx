'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function NewLeadDrawer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [source, setSource] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [leadScore, setLeadScore] = useState<string>('0');

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open]);

  function reset() {
    setFullName('');
    setEmail('');
    setPhone('');
    setCompany('');
    setSource('');
    setTagsInput('');
    setLeadScore('0');
    setError(null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const score = Number(leadScore) || 0;

      const res = await fetch('/api/admin/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          email: email || null,
          phone: phone || null,
          company: company || null,
          source: source || null,
          tags,
          lead_score: Math.max(0, Math.min(100, Math.round(score))),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to create lead.');
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
        New lead
      </Button>

      {/* Backdrop */}
      {open ? (
        <div
          className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm transition-opacity"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* Drawer */}
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
                New lead
              </p>
              <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-ink">
                Add a contact
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

        <form
          onSubmit={submit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                required
                maxLength={200}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@acme.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 ..."
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="source">Source</Label>
                <Input
                  id="source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="referral, inbound, event…"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="design, signature-site, priority"
              />
              <p className="font-sans text-xs text-ink-subtle">
                Comma-separated. Max 20.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead_score">Lead score (0–100)</Label>
              <Input
                id="lead_score"
                type="number"
                min={0}
                max={100}
                value={leadScore}
                onChange={(e) => setLeadScore(e.target.value)}
              />
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
            <Button type="submit" size="sm" disabled={busy || !fullName.trim()}>
              {busy ? 'Saving…' : 'Create lead'}
            </Button>
          </footer>
        </form>
      </aside>
    </>
  );
}
