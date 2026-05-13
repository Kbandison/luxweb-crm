'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';

/**
 * Slide-in drawer for editing a contact's identity, contact info, and
 * tags. Backed by PATCH /api/admin/contacts/[id]. The full_name change
 * cascades to the linked auth user's record so signatures keep matching.
 */
export function EditContactDrawer({
  contactId,
  initial,
}: {
  contactId: string;
  initial: {
    fullName: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    source: string | null;
    tags: string[];
    leadScore: number;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const headingId = useId();
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(initial.fullName);
  const [email, setEmail] = useState(initial.email ?? '');
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [company, setCompany] = useState(initial.company ?? '');
  const [source, setSource] = useState(initial.source ?? '');
  const [tagsInput, setTagsInput] = useState(initial.tags.join(', '));
  const [leadScore, setLeadScore] = useState(String(initial.leadScore));

  // Reset to initial when re-opened in case the user closed without saving.
  useEffect(() => {
    if (!open) return;
    setFullName(initial.fullName);
    setEmail(initial.email ?? '');
    setPhone(initial.phone ?? '');
    setCompany(initial.company ?? '');
    setSource(initial.source ?? '');
    setTagsInput(initial.tags.join(', '));
    setLeadScore(String(initial.leadScore));
    setError(null);
  }, [open, initial]);

  // Override Dialog's default autofocus (close button is first focusable
  // in DOM) so the form's first field gets focus instead.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const score = Math.max(
        0,
        Math.min(100, Math.floor(Number(leadScore) || 0)),
      );

      const res = await fetch(`/api/admin/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          company: company.trim() || null,
          source: source.trim() || null,
          tags,
          lead_score: score,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.error ?? 'Failed to save.';
        setError(msg);
        toast.error("Couldn't save contact", msg);
        return;
      }

      setOpen(false);
      toast.success('Contact updated');
      router.refresh();
    } catch {
      const msg = 'Network error. Try again.';
      setError(msg);
      toast.error("Couldn't save contact", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted transition-colors hover:border-copper/40 hover:text-copper"
      >
        Edit
      </button>

      <Drawer
        open={open}
        onClose={() => (busy ? undefined : setOpen(false))}
        side="right"
        width="md"
        labelledBy={headingId}
        closeOnBackdropClick={!busy}
        closeOnEscape={!busy}
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
                Edit contact
              </p>
              <h2
                id={headingId}
                className="mt-1 font-display text-2xl font-medium tracking-tight text-ink"
              >
                Update contact details
              </h2>
              <p className="mt-1 font-sans text-xs text-ink-muted">
                Changes to <span className="text-ink">Full name</span> sync
                to the portal user record so signatures keep matching.
              </p>
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
              <Label htmlFor="edit_full_name">Full legal name</Label>
              <Input
                ref={firstFieldRef}
                id="edit_full_name"
                required
                maxLength={200}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <p className="font-sans text-xs text-ink-subtle">
                Used as the on-file name for proposal acceptance and contract
                signature verification.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit_email">Email</Label>
                <Input
                  id="edit_email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit_phone">Phone</Label>
                <Input
                  id="edit_phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit_company">Company</Label>
                <Input
                  id="edit_company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit_source">Source</Label>
                <Input
                  id="edit_source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit_tags">Tags</Label>
              <Input
                id="edit_tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="design, signature-site, priority"
              />
              <p className="font-sans text-xs text-ink-subtle">
                Comma-separated. Max 20.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit_lead_score">Lead score (0–100)</Label>
              <Input
                id="edit_lead_score"
                type="text"
                inputMode="numeric"
                value={leadScore}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9]/g, '');
                  setLeadScore(cleaned);
                }}
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
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </footer>
        </form>
      </Drawer>
    </>
  );
}
