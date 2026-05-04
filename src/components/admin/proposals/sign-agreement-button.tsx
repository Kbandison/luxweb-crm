'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Admin counter-signs the agreement. One-click on the orphan banner →
 * dialog → submit → contract row created with admin signature captured,
 * status: pending_client_signature, client gets notified.
 */
export function SignAgreementButton({
  proposalId,
  defaultSignerName,
}: {
  proposalId: string;
  defaultSignerName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(defaultSignerName ?? '');
  const [agreed, setAgreed] = useState(false);
  const [, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => nameRef.current?.focus());
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) setOpen(false);
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, busy]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !agreed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/proposals/${proposalId}/sign-agreement`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: name.trim(),
            agreed: true,
          }),
        },
      );
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Failed to sign.');
        return;
      }
      setOpen(false);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <Button size="sm" onClick={() => setOpen(true)} disabled={busy}>
          Sign agreement
        </Button>
        {error && !open ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
            {error}
          </p>
        ) : null}
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 p-4"
          onClick={!busy ? () => setOpen(false) : undefined}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <div className="space-y-1">
              <h2 className="font-display text-lg font-medium text-ink">
                Counter-sign agreement
              </h2>
              <p className="font-sans text-xs text-ink-muted">
                Captures your typed signature, IP, and timestamp. Status flips
                to awaiting the client&apos;s signature; client will be
                notified.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin_sign_name">Full legal name</Label>
              <Input
                ref={nameRef}
                id="admin_sign_name"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Kevin Bandison"
              />
            </div>

            <label className="flex items-start gap-3 rounded-lg bg-surface-2/60 px-3 py-2.5">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border accent-copper"
              />
              <p className="font-sans text-sm text-ink">
                I&apos;m signing on behalf of LuxWeb Studio. My typed name is
                my electronic signature.
              </p>
            </label>

            {error ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={busy || !name.trim() || !agreed}
              >
                {busy ? 'Signing…' : 'Sign agreement'}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
