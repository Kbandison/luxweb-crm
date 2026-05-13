'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SuccessModal } from '@/components/ui/success-modal';
import { useToast } from '@/components/ui/toast';

/**
 * Inline sign form rendered below the agreement preview on
 * /admin/proposals/[id]/sign-agreement. Captures admin's typed name +
 * agreement checkbox and submits to the sign-agreement endpoint, which
 * creates the contract row with admin sig populated and notifies the
 * client to add theirs.
 */
export function AdminSignForm({
  proposalId,
  defaultSignerName,
}: {
  proposalId: string;
  defaultSignerName?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(defaultSignerName ?? '');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [createdContractId, setCreatedContractId] = useState<string | null>(
    null,
  );
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queueMicrotask(() => nameRef.current?.focus());
  }, []);

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
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        contract_id?: string;
      };
      if (!res.ok) {
        const msg = j.error ?? 'Failed to sign.';
        setError(msg);
        toast.error("Couldn't sign agreement", msg);
        return;
      }
      setCreatedContractId(j.contract_id ?? null);
      setConfirmOpen(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-2xl border border-copper/30 bg-copper-soft/25 p-6"
    >
      <div>
        <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
          Your turn — counter-sign
        </p>
        <p className="mt-2 font-sans text-sm text-ink-muted">
          Once you sign, status flips to{' '}
          <span className="text-ink">awaiting client signature</span> and the
          client gets emailed to add theirs.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="admin_sign_full_name">Full legal name</Label>
        <Input
          ref={nameRef}
          id="admin_sign_full_name"
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={defaultSignerName ?? 'Your full name'}
        />
        {defaultSignerName ? (
          <p className="font-sans text-xs text-ink-subtle">
            Type{' '}
            <span className="font-mono text-ink">{defaultSignerName}</span>{' '}
            exactly to sign. (Update your profile first if your legal name
            differs.)
          </p>
        ) : (
          <p className="font-sans text-xs text-danger">
            No name on file for your account. Set your full name in Profile
            before signing.
          </p>
        )}
      </div>

      <label className="flex items-start gap-3 rounded-lg bg-surface px-3 py-2.5 ring-1 ring-border">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border accent-copper"
        />
        <span className="font-sans text-sm text-ink">
          I&apos;m signing on behalf of LuxWeb Studio. My typed name above is
          my electronic signature on the agreement shown.
        </span>
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 font-sans text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={busy}
        >
          Back
        </Button>
        <Button type="submit" disabled={busy || !name.trim() || !agreed}>
          {busy ? 'Signing…' : 'Sign agreement'}
        </Button>
      </div>

      <SuccessModal
        open={confirmOpen}
        title="Agreement counter-signed"
        description={
          <>
            Status is now <strong>awaiting client signature</strong>. The
            client just got an email with the link to sign their side.
          </>
        }
        primaryLabel="View agreement"
        onPrimary={() => {
          setConfirmOpen(false);
          if (createdContractId) {
            router.push(`/admin/contracts/${createdContractId}`);
          } else {
            router.refresh();
          }
        }}
        onClose={() => {
          setConfirmOpen(false);
          if (createdContractId) {
            router.push(`/admin/contracts/${createdContractId}`);
          } else {
            router.refresh();
          }
        }}
      />
    </form>
  );
}
