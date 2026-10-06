'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function VoidContractButton({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const reasonOk = reason.trim().length >= 3;

  async function onVoid() {
    if (!reasonOk) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
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
        description={
          <div className="space-y-3">
            <p>
              Voiding marks the contract inactive. The record stays, with your
              reason, as part of the legal history.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor={`void-reason-${contractId}`}>Reason</Label>
              <Input
                id={`void-reason-${contractId}`}
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Mutual termination · reissued with new scope"
              />
            </div>
          </div>
        }
        confirmLabel="Void contract"
        tone="danger"
        busy={busy}
        confirmDisabled={!reasonOk}
        onConfirm={onVoid}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
