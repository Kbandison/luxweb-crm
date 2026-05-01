'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDateTimeLongTz } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { ContractStatus } from '@/lib/types/contract';

export function PrintBar() {
  return (
    <div className="flex justify-end print:hidden">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => window.print()}
      >
        Print
      </Button>
    </div>
  );
}

export function ClientContractActions({
  contractId,
  status,
  signedAt,
  signedName,
}: {
  contractId: string;
  status: ContractStatus;
  signedAt: string | null;
  signedName: string | null;
}) {
  return (
    <div>
      {status === 'pending_signature' ? (
        <SignBar contractId={contractId} />
      ) : status === 'signed' ? (
        <SignedBanner signedAt={signedAt} signedName={signedName} />
      ) : (
        <div className="rounded-2xl border border-danger/30 bg-danger/5 p-6">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-danger">
            Void
          </p>
          <p className="mt-1 font-sans text-sm text-ink-muted">
            This contract was voided. Contact the team if this is unexpected.
          </p>
        </div>
      )}
    </div>
  );
}

function SignBar({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) setOpen(false);
    }
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [open, busy]);

  async function sign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fullName.trim() || !agreed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/client/contracts/${contractId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          agreed: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to sign.');
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="relative isolate overflow-hidden rounded-2xl border border-copper/30 bg-copper-soft/25 p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-copper/25 via-gold/10 to-transparent blur-2xl"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-copper">
              Step 2 · Sign the agreement
            </p>
            <p className="mt-1 font-display text-lg font-medium text-ink">
              Review the legal terms, then add your second signature.
            </p>
            <p className="mt-1 font-sans text-sm text-ink-muted">
              The proposal covered scope and investment. This agreement covers
              IP, confidentiality, liability, and the full legal terms.
            </p>
          </div>
          <Button type="button" onClick={() => setOpen(true)} className="shrink-0">
            Sign agreement
          </Button>
        </div>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
          onClick={!busy ? () => setOpen(false) : undefined}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_32px_80px_-20px_rgba(0,0,0,0.4)]"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-gradient-to-br from-copper/18 via-gold/8 to-transparent blur-2xl"
            />
            <header className="relative px-6 pb-4 pt-6">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-copper">
                Sign agreement
              </p>
              <h2 className="mt-1 font-display text-xl font-medium tracking-tight text-ink">
                Type your name to sign
              </h2>
              <p className="mt-1 font-sans text-sm text-ink-muted">
                Your typed name, IP address, and timestamp will be captured as
                your electronic signature on the agreement.
              </p>
            </header>
            <form onSubmit={sign} className="relative space-y-4 px-6 pb-6">
              <div className="space-y-1.5">
                <Label htmlFor="sign_name">Full legal name</Label>
                <Input
                  id="sign_name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>

              <label className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2/40 p-3">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-copper"
                />
                <span className="font-sans text-xs leading-relaxed text-ink">
                  I have read the agreement in full and agree to be legally
                  bound by its terms.
                </span>
              </label>

              {error ? (
                <p role="alert" className="font-sans text-xs text-danger">
                  {error}
                </p>
              ) : null}

              <footer className="flex items-center justify-end gap-2 pt-2">
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
                  disabled={busy || !fullName.trim() || !agreed}
                >
                  {busy ? 'Signing…' : 'Sign agreement'}
                </Button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SignedBanner({
  signedAt,
  signedName,
}: {
  signedAt: string | null;
  signedName: string | null;
}) {
  return (
    <div className={cn('rounded-2xl border border-success/30 bg-success/5 p-6')}>
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/15 text-success ring-1 ring-success/20"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-success">
            Signed
          </p>
          {signedName ? (
            <p
              className="mt-1 font-display text-2xl italic tracking-tight text-ink"
              style={{
                fontFamily:
                  '"Brush Script MT", "Apple Chancery", "Lucida Handwriting", cursive',
              }}
            >
              {signedName}
            </p>
          ) : null}
          {signedAt ? (
            <p className="mt-1 font-mono text-xs tabular-nums text-ink-muted">
              {formatDateTimeLongTz(signedAt)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
