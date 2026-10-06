'use client';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';

/**
 * Sign or decline a change order. Signing sends the fingerprint of the text
 * on the page; if the change is billed on signing, it goes straight to the
 * invoice.
 */
export function ChangeOrderActions({
  changeOrderId,
  bodySha256,
  expectedSignerName,
}: {
  changeOrderId: string;
  bodySha256: string;
  expectedSignerName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const signId = useId();
  const declineId = useId();
  const [mode, setMode] = useState<'sign' | 'decline' | null>(null);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/client/change-orders/${changeOrderId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name.trim(), agreed: true, body_sha256: bodySha256 }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        project_id?: string;
        invoice_id?: string | null;
      };
      if (!res.ok) {
        setError(j.error ?? "Couldn't sign the change order.");
        return;
      }
      setMode(null);
      if (j.invoice_id && j.project_id) {
        toast.success('Change order signed', "Here's the invoice for it.");
        router.push(`/portal/project/${j.project_id}/invoices/${j.invoice_id}/pay`);
        return;
      }
      toast.success('Change order signed', 'Your signed copy is on its way by email.');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function decline(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/client/change-orders/${changeOrderId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Couldn't decline the change order.");
        return;
      }
      setMode(null);
      toast.success('Declined', "We've let the team know.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-copper/30 bg-copper-soft/25 p-6">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
            Waiting on you
          </p>
          <p className="mt-1 font-sans text-sm text-ink-muted">
            We&apos;ve signed this change. Sign to make it part of your
            agreement, or decline to leave the agreement as it is.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setMode('decline')}>
            Decline
          </Button>
          <Button type="button" onClick={() => setMode('sign')}>
            Sign change order
          </Button>
        </div>
      </div>

      <Dialog
        open={mode === 'sign'}
        onClose={() => setMode(null)}
        closeOnBackdropClick={!busy}
        closeOnEscape={!busy}
        labelledBy={signId}
        className="z-50 bg-ink/50 backdrop-blur-sm"
        panelClassName="w-full max-w-md"
      >
        <form onSubmit={sign} className="space-y-4 rounded-2xl border border-border bg-surface p-6">
          <h2 id={signId} className="font-display text-xl font-medium tracking-tight text-ink">
            Type your name to sign
          </h2>
          <p className="font-sans text-sm text-ink-muted">
            Your typed name, IP address, and timestamp are recorded as your
            electronic signature.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`${signId}-name`}>Full legal name</Label>
            <Input
              id={`${signId}-name`}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={expectedSignerName}
            />
          </div>
          <label className="flex items-start gap-2 text-ink">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-copper"
            />
            <span className="text-sm">I&apos;ve read this change order and agree to be bound by it.</span>
          </label>
          {error ? <p role="alert" className="font-sans text-xs text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !agreed || name.trim().length < 2}>
              {busy ? 'Signing…' : 'Sign'}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={mode === 'decline'}
        onClose={() => setMode(null)}
        closeOnBackdropClick={!busy}
        closeOnEscape={!busy}
        labelledBy={declineId}
        className="z-50 bg-ink/50 backdrop-blur-sm"
        panelClassName="w-full max-w-md"
      >
        <form onSubmit={decline} className="space-y-4 rounded-2xl border border-border bg-surface p-6">
          <h2 id={declineId} className="font-display text-xl font-medium tracking-tight text-ink">
            Decline this change?
          </h2>
          <p className="font-sans text-sm text-ink-muted">
            Your agreement stays exactly as it is. Tell us why if you like.
          </p>
          <textarea
            rows={4}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Reason (optional)"
            placeholder="Optional"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-sans text-sm text-ink focus:border-copper focus:outline-none"
          />
          {error ? <p role="alert" className="font-sans text-xs text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" size="sm" disabled={busy}>
              {busy ? 'Declining…' : 'Decline'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
