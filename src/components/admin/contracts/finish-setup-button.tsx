'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/**
 * Retry what didn't complete after a client signed — the deposit invoice
 * and/or the signed-copy email. Safe to press more than once: each step
 * claims its own work on the server.
 */
export function FinishSetupButton({ contractId }: { contractId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}/finish-setup`, {
        method: 'POST',
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        deposit_state?: string | null;
        executed_copy_sent?: boolean;
      };
      if (!res.ok) {
        toast.error("Couldn't finish setup", j.error ?? 'Try again in a moment.');
        return;
      }
      if (j.deposit_state === 'failed') {
        toast.error('Deposit invoice still failing', 'See the error on this page.');
      } else {
        toast.success('Setup finished');
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" size="sm" onClick={run} disabled={busy}>
      {busy ? 'Working…' : 'Finish setup'}
    </Button>
  );
}
