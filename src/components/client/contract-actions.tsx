'use client';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SuccessModal } from '@/components/ui/success-modal';
import { useToast } from '@/components/ui/toast';
import { formatDateLong, formatDateTimeLongTz } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { ContractStatus } from '@/lib/types/contract';

const NETWORK_ERROR =
  "Couldn't reach the server — check your connection and try again.";

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
  expectedSignerName,
  bodySha256,
  expiresAt,
  expired,
}: {
  contractId: string;
  status: ContractStatus;
  signedAt: string | null;
  signedName: string | null;
  /** The contact's on-file full_name. Typed signature must match. */
  expectedSignerName: string;
  /** Fingerprint of the text on this page — sent back when signing. */
  bodySha256: string | null;
  expiresAt: string | null;
  expired: boolean;
}) {
  const pending =
    status === 'pending_signature' || status === 'pending_client_signature';
  return (
    <div>
      {pending && expired ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-6">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-warning">
            This agreement has expired
          </p>
          <p className="mt-1 font-sans text-sm text-ink-muted">
            {expiresAt ? `It was open until ${formatDateLong(expiresAt)}. ` : ''}
            Reply to our email or message us and we&apos;ll send an updated one.
          </p>
        </div>
      ) : pending ? (
        <SignBar
          contractId={contractId}
          expectedSignerName={expectedSignerName}
          bodySha256={bodySha256}
          expiresAt={expiresAt}
        />
      ) : status === 'pending_admin_signature' ? (
        <div className="rounded-2xl border border-copper/30 bg-copper-soft/25 p-6">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
            Awaiting our counter-signature
          </p>
          <p className="mt-1 font-sans text-sm text-ink-muted">
            We&apos;ll sign first, then you&apos;ll get an email when the
            agreement is ready for your signature.
          </p>
        </div>
      ) : status === 'signed' ? (
        <SignedBanner signedAt={signedAt} signedName={signedName} />
      ) : (
        <div className="rounded-2xl border border-danger/30 bg-danger/5 p-6">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-danger">
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

function SignBar({
  contractId,
  expectedSignerName,
  bodySha256,
  expiresAt,
}: {
  contractId: string;
  expectedSignerName: string;
  bodySha256: string | null;
  expiresAt: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signedProjectId, setSignedProjectId] = useState<string | null>(null);
  const [signedInvoiceId, setSignedInvoiceId] = useState<string | null>(null);
  const [depositStatus, setDepositStatus] = useState<string | null>(null);

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
          ...(bodySha256 ? { body_sha256: bodySha256 } : {}),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = j.error ?? 'Failed to sign.';
        setError(msg);
        toast.error("Couldn't sign agreement", msg);
        return;
      }
      const j = (await res.json().catch(() => ({}))) as {
        project_id?: string;
        deposit_invoice_id?: string | null;
        deposit_status?: string;
      };
      setOpen(false);
      // A deposit is due: go straight to paying it — same sitting, no
      // extra click through a modal.
      if (j.deposit_invoice_id && j.project_id) {
        toast.success('Agreement signed', "Here's your deposit — your signed copy is on its way by email.");
        router.push(`/portal/project/${j.project_id}/invoices/${j.deposit_invoice_id}/pay`);
        return;
      }
      setSignedProjectId(j.project_id ?? null);
      setSignedInvoiceId(j.deposit_invoice_id ?? null);
      setDepositStatus(j.deposit_status ?? null);
      setConfirmOpen(true);
    } catch {
      setError(NETWORK_ERROR);
      toast.error("Couldn't sign agreement", NETWORK_ERROR);
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
            <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
              Sign your agreement
            </p>
            <p className="mt-1 font-display text-lg font-medium text-ink">
              We&apos;ve signed — it&apos;s waiting on you.
            </p>
            <p className="mt-1 font-sans text-sm text-ink-muted">
              Read the summary and the full agreement below, then sign.
              {expiresAt ? ` Open until ${formatDateLong(expiresAt)}.` : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <RequestChangesButton contractId={contractId} />
            <Button
              type="button"
              onClick={() => {
                // Don't greet a fresh attempt with the last one's error.
                setError(null);
                setOpen(true);
              }}
              className="shrink-0"
            >
              Sign agreement
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        closeOnBackdropClick={!busy}
        closeOnEscape={!busy}
        labelledBy="contract-sign-title"
        className="z-50 bg-ink/50 backdrop-blur-sm"
        panelClassName="w-full max-w-md"
      >
        <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_32px_80px_-20px_rgba(0,0,0,0.4)]">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-gradient-to-br from-copper/18 via-gold/8 to-transparent blur-2xl"
          />
          <header className="relative px-6 pb-4 pt-6">
            <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
              Sign agreement
            </p>
            <h2
              id="contract-sign-title"
              className="mt-1 font-display text-xl font-medium tracking-tight text-ink"
            >
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
                autoFocus
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={expectedSignerName}
              />
              <p className="font-sans text-xs text-ink-subtle">
                Type <span className="font-mono text-ink">{expectedSignerName}</span>{' '}
                exactly to sign. (Update your profile first if your legal name
                differs.)
              </p>
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
      </Dialog>

      <SuccessModal
        open={confirmOpen}
        title="Agreement signed"
        description={
          signedInvoiceId ? (
            <>
              Both signatures captured. We&apos;ve emailed your deposit
              invoice — pay it when you&apos;re ready and we&apos;ll kick off
              the project.
            </>
          ) : depositStatus === 'collected' ? (
            <>
              Both signatures captured. Your deposit is already marked as
              received, so there&apos;s nothing to pay right now — we&apos;ll
              be in touch about kickoff.
            </>
          ) : depositStatus === 'failed' ? (
            <>
              Both signatures captured. Your deposit invoice is on its way —
              we&apos;ll email it to you shortly.
            </>
          ) : (
            <>
              Both signatures captured. We&apos;ll be in touch about project
              kickoff shortly.
            </>
          )
        }
        primaryLabel={signedInvoiceId ? 'Pay deposit' : 'Got it'}
        onPrimary={() => {
          setConfirmOpen(false);
          if (signedInvoiceId && signedProjectId) {
            router.push(
              `/portal/project/${signedProjectId}/invoices/${signedInvoiceId}/pay`,
            );
          } else {
            router.refresh();
          }
        }}
        secondaryLabel={signedInvoiceId ? 'Later' : undefined}
        onSecondary={() => {
          setConfirmOpen(false);
          router.refresh();
        }}
        onClose={() => {
          setConfirmOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}

/**
 * "Request changes" — instead of signing, tell the studio what should be
 * different. The agreement stays open (they can still sign it as-is); the
 * studio replies with an updated version.
 */
function RequestChangesButton({ contractId }: { contractId: string }) {
  const router = useRouter();
  const toast = useToast();
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (message.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/client/contracts/${contractId}/request-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Couldn't send your request.");
        return;
      }
      setOpen(false);
      setMessage('');
      toast.success('Request sent', "We'll follow up with an updated agreement.");
      router.refresh();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Request changes
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        closeOnBackdropClick={!busy}
        closeOnEscape={!busy}
        labelledBy={headingId}
        className="z-50 bg-ink/50 backdrop-blur-sm"
        panelClassName="w-full max-w-md"
      >
        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.4)]"
        >
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
              Request changes
            </p>
            <h2 id={headingId} className="mt-1 font-display text-xl font-medium tracking-tight text-ink">
              What would you like changed?
            </h2>
            <p className="mt-1 font-sans text-sm text-ink-muted">
              We&apos;ll read it and send you an updated agreement. Nothing is
              signed, and you can still sign this one as it is.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${headingId}-message`}>Your note</Label>
            <textarea
              id={`${headingId}-message`}
              rows={5}
              maxLength={5000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Could the launch move to January? And we'd like the booking page in the first phase."
              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-sans text-sm text-ink focus:border-copper focus:outline-none"
            />
          </div>
          {error ? (
            <p role="alert" className="font-sans text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || message.trim().length < 3}>
              {busy ? 'Sending…' : 'Send request'}
            </Button>
          </div>
        </form>
      </Dialog>
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
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-success">
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
