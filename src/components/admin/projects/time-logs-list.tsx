'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TimeLog } from '@/lib/queries/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatDate, formatHours, formatRelative } from '@/lib/formatters';

export function TimeLogsList({
  projectId,
  initial,
}: {
  projectId: string;
  initial: TimeLog[];
}) {
  const router = useRouter();
  const [hours, setHours] = useState('');
  const [logDate, setLogDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<TimeLog | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const total = initial.reduce((s, t) => s + t.hours, 0);
  const month = initial
    .filter((t) => {
      const d = new Date(t.logDate);
      const now = new Date();
      return (
        d.getUTCFullYear() === now.getUTCFullYear() &&
        d.getUTCMonth() === now.getUTCMonth()
      );
    })
    .reduce((s, t) => s + t.hours, 0);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const h = Number(hours);
    if (!h || h <= 0) {
      setError('Hours must be greater than 0.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/time-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          hours: h,
          log_date: logDate,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to add time log.');
        return;
      }
      setHours('');
      setNote('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!confirming) return;
    setConfirmBusy(true);
    setPendingId(confirming.id);
    try {
      await fetch(`/api/admin/time-logs/${confirming.id}`, { method: 'DELETE' });
    } finally {
      setConfirmBusy(false);
      setPendingId(null);
      setConfirming(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* Admin-only banner */}
      <div className="flex items-center gap-2 rounded-lg border border-copper/25 bg-copper-soft/40 px-3 py-2">
        <span aria-hidden className="text-copper">🔒</span>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-copper">
          Admin only — never sent to the client portal
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Total logged" value={`${total.toFixed(1)}h`} />
        <Stat label="This month" value={`${month.toFixed(1)}h`} />
      </div>

      {/* Composer */}
      <form
        onSubmit={submit}
        className="overflow-hidden rounded-xl border border-border bg-surface"
      >
        <div className="grid gap-4 p-5 sm:grid-cols-[120px_140px_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="t_hours">Hours</Label>
            <Input
              id="t_hours"
              type="number"
              step="0.25"
              min="0.25"
              max="99"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="2.5"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t_date">Date</Label>
            <Input
              id="t_date"
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t_note">Note</Label>
            <Input
              id="t_note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What you worked on (optional)"
              maxLength={500}
            />
          </div>
          <Button type="submit" size="sm" disabled={busy || !hours}>
            {busy ? 'Saving…' : 'Log time'}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="border-t border-border bg-surface-2/40 px-5 py-2 font-sans text-xs text-danger">
            {error}
          </p>
        ) : null}
      </form>

      {/* Entries */}
      {initial.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
          <p className="font-sans text-sm text-ink-muted">
            No time logged. Use the form above to add an entry.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-border bg-surface text-left">
              <tr className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-3 py-3 text-right font-medium">Hours</th>
                <th className="px-3 py-3 font-medium">Note</th>
                <th className="px-3 py-3 font-medium">Logged by</th>
                <th className="px-5 py-3 text-right font-medium">Logged</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {initial.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b border-border last:border-b-0 transition-opacity ${pendingId === t.id ? 'opacity-50' : ''}`}
                >
                  <td className="px-5 py-3 font-mono text-xs tabular-nums text-ink">
                    {formatDate(t.logDate)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-sm font-medium tabular-nums text-ink">
                    {formatHours(t.hours)}
                  </td>
                  <td className="px-3 py-3 font-sans text-sm text-ink-muted">
                    {t.note ?? '—'}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-ink-muted">
                    {t.createdByEmail ?? 'system'}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-ink-subtle">
                    {formatRelative(t.createdAt)}
                  </td>
                  <td className="py-3 pr-5 text-right">
                    <button
                      type="button"
                      onClick={() => setConfirming(t)}
                      disabled={pendingId === t.id}
                      className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted transition-colors hover:text-danger disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        tone="danger"
        title="Delete time entry"
        description={
          confirming ? (
            <>
              Remove the{' '}
              <span className="font-mono text-ink">
                {formatHours(confirming.hours)}h
              </span>{' '}
              entry from this project? This can&apos;t be undone.
            </>
          ) : null
        }
        confirmLabel="Delete entry"
        busy={confirmBusy}
        onCancel={() => (confirmBusy ? undefined : setConfirming(null))}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
        {label}
      </p>
      <p className="mt-2 font-mono text-2xl font-medium tabular-nums tracking-tight text-ink">
        {value}
      </p>
    </div>
  );
}

