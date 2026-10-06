'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';

/** Withdraw a change order the client hasn't signed. They're told why. */
export function WithdrawChangeOrderButton({ changeOrderId }: { changeOrderId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = reason.trim().length >= 3;

  async function withdraw() {
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/change-orders/${changeOrderId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error("Couldn't withdraw it", j.error ?? '');
        return;
      }
      setOpen(false);
      toast.success('Change order withdrawn');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Withdraw
      </Button>
      <ConfirmDialog
        open={open}
        tone="danger"
        title="Withdraw this change order?"
        description={
          <div className="space-y-3">
            <p>The client can no longer sign it, and they&apos;re told why.</p>
            <div className="space-y-1.5">
              <Label htmlFor={`withdraw-${changeOrderId}`}>Reason</Label>
              <Input
                id={`withdraw-${changeOrderId}`}
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Sending a revised version"
              />
            </div>
          </div>
        }
        confirmLabel="Withdraw"
        busy={busy}
        confirmDisabled={!ok}
        onConfirm={withdraw}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
