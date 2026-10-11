'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';

/**
 * Send the client the sign request again — same agreement, same link. For
 * an email that got buried or went out broken; changing the terms is
 * Revise & resend's job.
 */
export function ResendAgreementButton({
  contractId,
  clientName,
}: {
  contractId: string;
  clientName?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const who = clientName?.trim() || 'the client';

  async function resend() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}/resend`, { method: 'POST' });
      const j = (await res.json().catch(() => ({}))) as { error?: string; via?: string };
      if (!res.ok) {
        toast.error(
          "Couldn't resend",
          res.status === 429 ? 'Already resent a few times this hour — try again later.' : (j.error ?? 'Try again.'),
        );
        return;
      }
      toast.success(
        'Sent again',
        j.via === 'invite'
          ? `${who} has a fresh portal invite that opens the agreement.`
          : `${who} has a new email with the link to sign.`,
      );
      router.refresh();
    } catch {
      toast.error("Couldn't resend", "Couldn't reach the server — check your connection and try again.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setConfirming(true)}
        disabled={busy}
      >
        Resend email
      </Button>
      <ConfirmDialog
        open={confirming}
        title={`Resend the sign email to ${who}?`}
        description="They get the same agreement and the same link again. Nothing is voided and the expiry date doesn't change."
        confirmLabel="Resend email"
        busy={busy}
        onConfirm={resend}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
