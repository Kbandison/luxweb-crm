'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatDateTime } from '@/lib/formatters';
import {
  DUE_LABEL,
  DUE_TONE,
  LOG_DISPOSITIONS,
  STATUS_LABEL,
  STATUS_TONE,
  dueState,
} from '@/lib/outreach/meta';
import { localTimeForPhone } from '@/lib/outreach/area-codes';
import type { ProspectRow, SetterOption } from '@/lib/queries/outreach';
import { ProspectDrawer } from './prospect-drawer';
import { BookAppointmentButton } from './book-appointment-button';

export function ProspectCard({
  prospect: p,
  mode,
  now,
  selected,
  onToggleSelect,
  setters,
  onDelete,
}: {
  prospect: ProspectRow;
  mode: 'setter' | 'owner';
  /** Server-rendered "now" — keeps local time + due state hydration-stable. */
  now: Date;
  selected: boolean;
  onToggleSelect: () => void;
  /** Owner only: reassign target list. */
  setters?: SetterOption[];
  onDelete: () => void;
}) {
  const due = dueState(p.nextActionAt, now);
  const local = localTimeForPhone(p.phone, now);

  return (
    <li className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${p.fullName}`}
            className="mt-1 h-4 w-4 shrink-0 accent-copper"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-sans text-sm font-medium text-ink">{p.fullName}</span>
              {p.company ? (
                <span className="font-sans text-sm text-ink-muted">· {p.company}</span>
              ) : null}
              <StatusPill label={STATUS_LABEL[p.status]} tone={STATUS_TONE[p.status]} size="sm" />
              {due ? (
                <StatusPill label={DUE_LABEL[due]} tone={DUE_TONE[due]} size="sm" />
              ) : null}
              {p.attempts > 0 ? (
                <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                  {p.attempts} {p.attempts === 1 ? 'dial' : 'dials'}
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-sans text-xs text-ink-muted">
              {p.phone ? (
                <a
                  href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}
                  className="text-copper hover:underline"
                >
                  {p.phone}
                </a>
              ) : null}
              {local ? (
                <span
                  className={
                    local.offHours
                      ? 'font-mono text-[10px] uppercase tracking-meta text-danger'
                      : 'font-mono text-[10px] uppercase tracking-meta text-ink-subtle'
                  }
                  title={local.offHours ? 'Outside 8am–8pm where they are' : 'Their local time'}
                >
                  {local.label} local{local.offHours ? ' · off hours' : ''}
                </span>
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
              <p
                className={`mt-1 font-mono text-[10px] uppercase tracking-meta ${
                  due === 'overdue' ? 'text-danger' : 'text-warning'
                }`}
              >
                Next: {p.nextAction ?? 'follow up'}
                {p.nextActionAt ? ` · ${formatDateTime(p.nextActionAt)}` : ''}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {mode === 'setter' ? <BookAppointmentButton prospect={p} /> : null}
          {mode === 'owner' && setters && setters.length > 0 ? (
            <ReassignSelect prospect={p} setters={setters} />
          ) : null}
          <ProspectDrawer prospect={p} triggerLabel="Edit" triggerVariant="secondary" />
          <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      {p.history.length > 0 ? <CallHistory calls={p.history} /> : null}
      {mode === 'setter' ? <LogCallForm prospectId={p.id} /> : null}
    </li>
  );
}

/** Past dials — what was said on attempts 1–3 before you make the fourth. */
function CallHistory({ calls }: { calls: ProspectRow['history'] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle hover:text-copper"
        aria-expanded={open}
      >
        {open ? '▾' : '▸'} History · {calls.length} logged
      </button>
      {open ? (
        <ul className="mt-2 space-y-1.5">
          {calls.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 font-sans text-xs">
              <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                {formatDate(c.calledAt)}
              </span>
              <span className="text-ink-muted">{STATUS_LABEL[c.disposition]}</span>
              {c.spokeWithDm ? (
                <span className="font-mono text-[10px] uppercase tracking-meta text-copper">
                  spoke w/ DM
                </span>
              ) : null}
              {c.note ? <span className="text-ink">— {c.note}</span> : null}
              {c.setterName ? (
                <span className="ml-auto font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                  {c.setterName}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ReassignSelect({
  prospect,
  setters,
}: {
  prospect: ProspectRow;
  setters: SetterOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function reassign(ownerId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/outreach/prospects/${prospect.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: ownerId || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't reassign", body.error ?? 'Try again.');
        return;
      }
      toast.success('Reassigned');
      router.refresh();
    } catch {
      toast.error("Couldn't reassign", 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      value={prospect.ownerId ?? ''}
      disabled={busy}
      onChange={(e) => void reassign(e.target.value)}
      aria-label={`Reassign ${prospect.fullName}`}
      className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-ink focus-visible:border-copper focus-visible:outline-none"
    >
      <option value="">Unassigned</option>
      {setters.map((s) => (
        <option key={s.userId} value={s.userId}>
          {s.name}
        </option>
      ))}
    </select>
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
          <input
            type="checkbox"
            checked={spoke}
            onChange={(e) => setSpoke(e.target.checked)}
            className="h-4 w-4 accent-copper"
          />
          Spoke w/ decision-maker
        </label>
        <label className="inline-flex items-center gap-1.5 font-sans text-xs text-ink-muted">
          <span>Callback</span>
          <Input
            type="datetime-local"
            value={nextAt}
            onChange={(e) => setNextAt(e.target.value)}
            className="h-9 w-auto"
          />
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
