'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export function VoidContractButton({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onVoid() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? 'Failed to void contract');
        return;
      }
      router.refresh();
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
        disabled={busy}
      >
        Void contract
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Void this contract?"
        description="Voiding marks the contract inactive. The record stays for audit history, but the proposal it generated can then be deleted if needed."
        confirmLabel="Void contract"
        tone="danger"
        busy={busy}
        onConfirm={onVoid}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
