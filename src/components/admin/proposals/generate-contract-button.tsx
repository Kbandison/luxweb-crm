'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

/**
 * Recovery button for accepted proposals whose contract auto-gen failed at
 * acceptance time. One-click generates the missing contract row and
 * refreshes the page so the contract appears in the list.
 */
export function GenerateContractButton({
  proposalId,
}: {
  proposalId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/proposals/${proposalId}/generate-contract`,
        { method: 'POST' },
      );
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        contract_id?: string;
      };
      if (!res.ok) {
        setError(j.error ?? 'Failed to generate contract.');
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={generate} disabled={busy}>
        {busy ? 'Generating…' : 'Generate contract'}
      </Button>
      {error ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
