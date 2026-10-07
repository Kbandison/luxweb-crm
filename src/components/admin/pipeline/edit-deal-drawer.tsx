'use client';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import type { DealCard } from '@/lib/queries/admin';

/**
 * Edit drawer for a pipeline deal. Lead-capture deals land at value 0 with a
 * placeholder title; this is how the admin fills in the value, title,
 * probability, and expected close as the deal progresses (stage is changed
 * by dragging). PATCHes /api/admin/deals/[id].
 *
 * Controlled by DealCard, which renders it OUTSIDE the draggable <article>:
 * React events bubble through the component tree (portal or not), so a
 * drawer nested in the card fed every keystroke and pointerdown to dnd-kit
 * — Space/Enter started a keyboard drag, arrows moved the card.
 */
export function EditDealDrawer({
  deal,
  open,
  onClose,
}: {
  deal: DealCard;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const headingId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [delBusy, setDelBusy] = useState(false);

  const [title, setTitle] = useState(deal.title);
  const [valueDollars, setValueDollars] = useState(
    deal.valueCents ? String(deal.valueCents / 100) : '',
  );
  const [probability, setProbability] = useState(String(deal.probability));
  const [expectedClose, setExpectedClose] = useState(deal.expectedClose ?? '');

  // Re-seed from the deal each time the drawer opens — the prop may have
  // changed via a server refresh while the drawer was closed.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setTitle(deal.title);
      setValueDollars(deal.valueCents ? String(deal.valueCents / 100) : '');
      setProbability(String(deal.probability));
      setExpectedClose(deal.expectedClose ?? '');
      setError(null);
      setConfirmingDelete(false);
    }
  }

  async function destroy() {
    setDelBusy(true);
    try {
      const res = await fetch(`/api/admin/deals/${deal.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error("Couldn't delete deal", body.error ?? 'Delete failed.');
        return;
      }
      onClose();
      toast.success('Deal deleted');
      router.refresh();
    } catch {
      toast.error("Couldn't delete deal", 'Network error. Try again.');
    } finally {
      setDelBusy(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const dollars = Number(valueDollars) || 0;
      const res = await fetch(`/api/admin/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          value_cents: Math.max(0, Math.round(dollars * 100)),
          probability: Math.max(0, Math.min(100, Number(probability) || 0)),
          expected_close: expectedClose || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.error ?? 'Failed to save deal.';
        setError(msg);
        toast.error("Couldn't save deal", msg);
        setBusy(false);
        return;
      }
      onClose();
      toast.success('Deal updated');
      router.refresh();
    } catch {
      setError('Network error. Try again.');
      toast.error("Couldn't save deal", 'Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      side="right"
      width="md"
      labelledBy={headingId}
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
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
              Edit deal
            </p>
            <h2
              id={headingId}
              className="mt-1 truncate font-display text-2xl font-medium tracking-tight text-ink"
            >
              {deal.contactName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
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
            <Label htmlFor="edit_title">Deal title</Label>
            <Input
              id="edit_title"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Signature site rebuild"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_value">Value (USD)</Label>
            <Input
              id="edit_value"
              type="number"
              min={0}
              step="0.01"
              value={valueDollars}
              onChange={(e) => setValueDollars(e.target.value)}
              placeholder="5000"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit_probability">Probability (0–100)</Label>
              <Input
                id="edit_probability"
                type="number"
                min={0}
                max={100}
                value={probability}
                onChange={(e) => setProbability(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_expected_close">Expected close</Label>
              <Input
                id="edit_expected_close"
                type="date"
                value={expectedClose}
                onChange={(e) => setExpectedClose(e.target.value)}
              />
            </div>
          </div>

          <p className="font-sans text-xs text-ink-subtle">
            Drag the card between columns to change its stage.
          </p>

          {error ? (
            <p role="alert" className="font-sans text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border bg-surface px-6 py-4">
          {confirmingDelete ? (
            <div className="flex w-full items-center justify-between gap-3">
              <span className="font-sans text-xs text-danger">
                Delete this deal permanently?
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={delBusy}
                >
                  Keep
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={destroy}
                  disabled={delBusy}
                >
                  {delBusy ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
                className="text-danger hover:bg-danger/10 hover:text-danger"
              >
                Delete
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={busy || !title.trim()}>
                  {busy ? 'Saving…' : 'Save deal'}
                </Button>
              </div>
            </>
          )}
        </footer>
      </form>
    </Drawer>
  );
}
