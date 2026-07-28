'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/formatters';
import { LOG_DISPOSITIONS, STATUS_LABEL, STATUS_TONE } from '@/lib/outreach/meta';
import type { ProspectRow } from '@/lib/queries/outreach';
import { ProspectDrawer } from './prospect-drawer';
import { BookAppointmentButton } from './book-appointment-button';

export function ProspectList({
  prospects,
  mode,
}: {
  prospects: ProspectRow[];
  /** 'setter' → log calls; 'owner' → read + who owns it. */
  mode: 'setter' | 'owner';
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirming = prospects.find((p) => p.id === confirmId) ?? null;

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/outreach/prospects/${id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't delete", body.error ?? 'Try again.');
        return;
      }
      toast.success('Prospect removed');
      setConfirmId(null);
      router.refresh();
    } catch {
      toast.error("Couldn't delete", 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  if (prospects.length === 0) {
    return (
      <EmptyState
        title="No prospects yet"
        description={mode === 'setter' ? 'Add one with the button above and start dialing.' : 'Nothing here yet.'}
      />
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {prospects.map((p) => (
          <li key={p.id} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-sans text-sm font-medium text-ink">{p.fullName}</span>
                  {p.company ? <span className="font-sans text-sm text-ink-muted">· {p.company}</span> : null}
                  <StatusPill label={STATUS_LABEL[p.status]} tone={STATUS_TONE[p.status]} size="sm" />
                  {p.attempts > 0 ? (
                    <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                      {p.attempts} {p.attempts === 1 ? 'dial' : 'dials'}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-sans text-xs text-ink-muted">
                  {p.phone ? (
                    <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="text-copper hover:underline">
                      {p.phone}
                    </a>
                  ) : null}
                  {p.email ? <span>{p.email}</span> : null}
                  {p.industry ? <span>{p.industry}</span> : null}
                  {mode === 'owner' && p.ownerName ? (
                    <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                      Setter · {p.ownerName}
                    </span>
                  ) : null}
                </div>
                {p.websiteProblem ? (
                  <p className="mt-1.5 font-sans text-xs text-ink">
                    <span className="text-ink-subtle">Angle:</span> {p.websiteProblem}
                  </p>
                ) : null}
                {p.nextAction || p.nextActionAt ? (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-meta text-warning">
                    Next: {p.nextAction ?? 'follow up'}
                    {p.nextActionAt ? ` · ${formatDate(p.nextActionAt)}` : ''}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {mode === 'setter' ? <BookAppointmentButton prospect={p} /> : null}
                <ProspectDrawer prospect={p} triggerLabel="Edit" triggerVariant="secondary" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmId(p.id)}>
                  Delete
                </Button>
              </div>
            </div>

            {mode === 'setter' ? <LogCallForm prospectId={p.id} /> : null}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? `Remove ${confirming.fullName}?` : ''}
        description="This deletes the prospect and its call history."
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        onConfirm={() => {
          if (confirming) void remove(confirming.id);
        }}
        onCancel={() => setConfirmId(null)}
      />
    </>
  );
}

function LogCallForm({ prospectId }: { prospectId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [disposition, setDisposition] = useState('');
  const [spoke, setSpoke] = useState(false);
  const [note, setNote] = useState('');
  const [nextAt, setNextAt] = useState('');
  const [busy, setBusy] = useState(false);

  async function log(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!disposition) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/outreach/prospects/${prospectId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disposition,
          spoke_with_dm: spoke,
          note: note.trim() || null,
          next_action_at: nextAt || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't log call", body.error ?? 'Try again.');
        return;
      }
      setDisposition('');
      setSpoke(false);
      setNote('');
      setNextAt('');
      toast.success('Call logged');
      router.refresh();
    } catch {
      toast.error("Couldn't log call", 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={log} className="mt-4 space-y-3 border-t border-border/60 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={disposition}
          onChange={(e) => setDisposition(e.target.value)}
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-ink focus-visible:border-copper focus-visible:outline-none"
        >
          <option value="">Log outcome…</option>
          {LOG_DISPOSITIONS.map((d) => (
            <option key={d} value={d}>
              {STATUS_LABEL[d]}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 font-sans text-xs text-ink-muted">
          <input type="checkbox" checked={spoke} onChange={(e) => setSpoke(e.target.checked)} className="h-4 w-4 accent-copper" />
          Spoke w/ decision-maker
        </label>
        <label className="inline-flex items-center gap-1.5 font-sans text-xs text-ink-muted">
          <span>Callback</span>
          <Input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} className="h-9 w-auto" />
        </label>
        <Button type="submit" size="sm" disabled={busy || !disposition}>
          {busy ? 'Logging…' : 'Log call'}
        </Button>
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={4000}
        placeholder="What they actually said…"
        className="h-9"
      />
    </form>
  );
}
