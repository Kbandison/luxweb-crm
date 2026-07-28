'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { formatDateTime, formatUSD } from '@/lib/formatters';
import type { AppointmentRow } from '@/lib/queries/outreach';

const STATUS_TONE: Record<AppointmentRow['status'], string> = {
  scheduled: 'bg-warning/15 text-warning',
  showed: 'bg-success/15 text-success',
  no_show: 'bg-danger/10 text-danger',
  canceled: 'bg-surface-2 text-ink-subtle',
};
const RESULT_TONE: Record<AppointmentRow['result'], string> = {
  pending: 'bg-surface-2 text-ink-subtle',
  won: 'bg-success/15 text-success',
  lost: 'bg-surface-2 text-ink-muted',
};

export function AppointmentList({
  appointments,
  mode,
}: {
  appointments: AppointmentRow[];
  mode: 'owner' | 'setter';
}) {
  if (appointments.length === 0) {
    return (
      <EmptyState
        title="No appointments"
        description={mode === 'setter' ? 'Book one from a prospect on your call list.' : 'Booked meetings will show here.'}
      />
    );
  }
  return (
    <ul className="space-y-3">
      {appointments.map((a) => (
        <li key={a.id} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-sans text-sm font-medium text-ink">
                  {a.businessName ?? a.contactName ?? '—'}
                </span>
                <StatusPill label={a.status.replace(/_/g, ' ')} tone={STATUS_TONE[a.status]} size="sm" />
                {a.result !== 'pending' ? (
                  <StatusPill label={a.result} tone={RESULT_TONE[a.result]} size="sm" />
                ) : null}
              </div>
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-meta text-ink-muted">
                {formatDateTime(a.scheduledAt)} · {a.durationMin}m
              </p>
              <p className="mt-0.5 font-sans text-xs text-ink-muted">
                {[a.contactName, a.phone, mode === 'owner' ? a.setterName && `Setter · ${a.setterName}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {a.commissionCents != null && a.result === 'won' ? (
                <p className="mt-1 font-mono text-[11px] text-success">
                  {formatUSD(a.dealValueCents ?? 0)} won · {formatUSD(a.commissionCents)} commission
                </p>
              ) : null}
            </div>
            {mode === 'owner' ? <OwnerControls appt={a} /> : <SetterControls appt={a} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function OwnerControls({ appt }: { appt: AppointmentRow }) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState(appt.status);
  const [result, setResult] = useState(appt.result);
  const [deal, setDeal] = useState(
    appt.dealValueCents != null ? String(appt.dealValueCents / 100) : '',
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { status, result };
      if (result === 'won') {
        payload.deal_value_cents = Math.round((Number(deal) || 0) * 100);
      }
      const res = await fetch(`/api/outreach/appointments/${appt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't save", body.error ?? 'Try again.');
        return;
      }
      toast.success('Updated');
      router.refresh();
    } catch {
      toast.error("Couldn't save", 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  const selCls =
    'h-8 rounded-md border border-border bg-surface px-2 text-xs text-ink focus-visible:border-copper focus-visible:outline-none';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={status} onChange={(e) => setStatus(e.target.value as AppointmentRow['status'])} className={selCls}>
        <option value="scheduled">Scheduled</option>
        <option value="showed">Showed</option>
        <option value="no_show">No-show</option>
        <option value="canceled">Canceled</option>
      </select>
      <select value={result} onChange={(e) => setResult(e.target.value as AppointmentRow['result'])} className={selCls}>
        <option value="pending">Pending</option>
        <option value="won">Won</option>
        <option value="lost">Lost</option>
      </select>
      {result === 'won' ? (
        <Input
          type="number"
          min={0}
          step="0.01"
          value={deal}
          onChange={(e) => setDeal(e.target.value)}
          placeholder="Deal $"
          className="h-8 w-24"
        />
      ) : null}
      <Button type="button" size="sm" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}

function SetterControls({ appt }: { appt: AppointmentRow }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      const res = await fetch(`/api/outreach/appointments/${appt.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't cancel", body.error ?? 'Try again.');
        return;
      }
      toast.success('Appointment canceled');
      router.refresh();
    } catch {
      toast.error("Couldn't cancel", 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  if (appt.status === 'canceled') return null;
  return (
    <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={busy}>
      {busy ? 'Canceling…' : 'Cancel'}
    </Button>
  );
}
