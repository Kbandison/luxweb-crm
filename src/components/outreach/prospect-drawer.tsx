'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import type { ProspectRow } from '@/lib/queries/outreach';

type Fields = {
  full_name: string;
  company: string;
  phone: string;
  email: string;
  industry: string;
  website_problem: string;
  source: string;
  notes: string;
};

function fromProspect(p?: ProspectRow | null): Fields {
  return {
    full_name: p?.fullName ?? '',
    company: p?.company ?? '',
    phone: p?.phone ?? '',
    email: p?.email ?? '',
    industry: p?.industry ?? '',
    website_problem: p?.websiteProblem ?? '',
    source: p?.source ?? '',
    notes: p?.notes ?? '',
  };
}

/** Add or edit a prospect on the call list. */
export function ProspectDrawer({
  prospect,
  triggerLabel,
  triggerVariant = 'primary',
  triggerSize = 'sm',
}: {
  prospect?: ProspectRow | null;
  triggerLabel?: string;
  triggerVariant?: ButtonProps['variant'];
  triggerSize?: ButtonProps['size'];
}) {
  const mode = prospect ? 'edit' : 'create';
  const router = useRouter();
  const toast = useToast();
  const headingId = useId();
  const firstRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Fields>(() => fromProspect(prospect));

  useEffect(() => {
    if (!open) return;
    setF(fromProspect(prospect));
    setError(null);
    const t = window.setTimeout(() => firstRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, prospect]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        full_name: f.full_name,
        company: f.company.trim() || null,
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        industry: f.industry.trim() || null,
        website_problem: f.website_problem.trim() || null,
        source: f.source.trim() || null,
        notes: f.notes.trim() || null,
      };
      const res = await fetch(
        mode === 'create'
          ? '/api/outreach/prospects'
          : `/api/outreach/prospects/${prospect!.id}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Failed to save.');
        toast.error("Couldn't save", body.error ?? 'Try again.');
        return;
      }
      setOpen(false);
      toast.success(mode === 'create' ? 'Prospect added' : 'Prospect updated', f.full_name);
      router.refresh();
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>
        {triggerLabel ?? (mode === 'create' ? 'Add prospect' : 'Edit')}
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} side="right" width="md" labelledBy={headingId}>
        <header className="border-b border-border px-6 pb-5 pt-6">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
            {mode === 'create' ? 'New prospect' : 'Edit prospect'}
          </p>
          <h2 id={headingId} className="mt-1 font-display text-2xl font-medium tracking-tight text-ink">
            {mode === 'create' ? 'Add to your call list' : f.full_name}
          </h2>
        </header>
        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p_name">Contact name</Label>
                <Input ref={firstRef} id="p_name" required maxLength={200} value={f.full_name} onChange={set('full_name')} placeholder="Robert Williams" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p_company">Business</Label>
                <Input id="p_company" value={f.company} onChange={set('company')} placeholder="Apex Auto Repair" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p_phone">Phone</Label>
                <Input id="p_phone" value={f.phone} onChange={set('phone')} placeholder="(770) 555-0142" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p_email">Email</Label>
                <Input id="p_email" type="email" value={f.email} onChange={set('email')} placeholder="rob@apexauto.com" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p_industry">Industry</Label>
                <Input id="p_industry" value={f.industry} onChange={set('industry')} placeholder="Auto repair" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p_source">Source</Label>
                <Input id="p_source" value={f.source} onChange={set('source')} placeholder="Google Maps, referral…" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p_problem">Website problem spotted</Label>
              <textarea
                id="p_problem"
                value={f.website_problem}
                onChange={set('website_problem')}
                rows={2}
                maxLength={1000}
                placeholder="7 sec load, no phone # above the fold…"
                className="flex w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
              />
              <p className="font-sans text-xs text-ink-subtle">Your pitch angle for the call.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p_notes">Notes</Label>
              <textarea
                id="p_notes"
                value={f.notes}
                onChange={set('notes')}
                rows={3}
                maxLength={4000}
                className="flex w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
              />
            </div>
            {error ? <p role="alert" className="font-sans text-xs text-danger">{error}</p> : null}
          </div>
          <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface px-6 py-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || !f.full_name.trim()}>
              {busy ? 'Saving…' : mode === 'create' ? 'Add prospect' : 'Save'}
            </Button>
          </footer>
        </form>
      </Drawer>
    </>
  );
}
