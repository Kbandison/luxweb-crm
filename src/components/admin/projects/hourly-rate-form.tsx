'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatUSD } from '@/lib/formatters';

/**
 * Inline editor for the project's hourly rate. Used on the project detail
 * "Budget & profitability" section. Stored as cents on crm.projects.
 */
export function HourlyRateForm({
  projectId,
  initialRateCents,
}: {
  projectId: string;
  initialRateCents: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [rateDollars, setRateDollars] = useState(
    initialRateCents != null ? String(Math.round(initialRateCents / 100)) : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const cents = rateDollars.trim() === '' ? null : Math.round(Number(rateDollars) * 100);
    if (cents != null && (!Number.isFinite(cents) || cents < 0)) {
      setError('Enter a valid hourly rate.');
      setBusy(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hourly_rate_cents: cents }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to save.');
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper hover:underline"
      >
        {initialRateCents != null
          ? `${formatUSD(initialRateCents)}/h · edit`
          : 'Set rate →'}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex items-end gap-2"
    >
      <div className="space-y-1">
        <Label htmlFor="hourly_rate" className="text-[10px]">
          $/hour
        </Label>
        <Input
          id="hourly_rate"
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          value={rateDollars}
          onChange={(e) => setRateDollars(e.target.value)}
          placeholder="125"
          className="w-24"
        />
      </div>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          setEditing(false);
          setError(null);
        }}
        disabled={busy}
      >
        Cancel
      </Button>
      {error ? (
        <p className="font-mono text-[10px] text-danger">{error}</p>
      ) : null}
    </form>
  );
}
