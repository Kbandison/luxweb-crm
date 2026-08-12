'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/**
 * Pull Mercury now, rather than waiting for the overnight cron. `days` widens
 * the window for a first run — the routine sync only looks back far enough to
 * catch late settlement.
 */
export function MercurySyncButton({ days }: { days?: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/finances/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(days ? { days } : {}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't sync", body.error ?? 'Try again.');
        return;
      }
      toast.success(
        `Synced ${body.transactions} transaction${body.transactions === 1 ? '' : 's'}`,
        `${body.accounts} account${body.accounts === 1 ? '' : 's'} refreshed.`,
      );
      router.refresh();
    } catch {
      toast.error("Couldn't sync", 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant={days ? 'secondary' : 'primary'}
      size="sm"
      disabled={busy}
      onClick={() => void sync()}
    >
      {busy ? 'Syncing…' : days ? `Backfill ${days}d` : 'Sync now'}
    </Button>
  );
}
