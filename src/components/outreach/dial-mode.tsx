'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/formatters';
import {
  DUE_LABEL,
  DUE_TONE,
  LOG_DISPOSITIONS,
  STATUS_LABEL,
  STATUS_TONE,
  dueState,
} from '@/lib/outreach/meta';
import { localTimeForPhone } from '@/lib/outreach/area-codes';
import type { ProspectRow } from '@/lib/queries/outreach';
import { ScriptPanel } from './script-panel';
import { BookAppointmentButton } from './book-appointment-button';

/** Dispositions that end the call in a good place — given the primary buttons. */
const PRIMARY: string[] = ['no_answer', 'callback', 'interested', 'booked'];

/**
 * One prospect at a time: number, angle, script, one-tap outcome, next.
 * The flat list is fine for reviewing; this is for actually working a queue of
 * 25 dials without scrolling between every call.
 */
export function DialMode({
  prospects,
  nowIso,
  script,
  objections,
}: {
  prospects: ProspectRow[];
  nowIso: string;
  script: string;
  objections: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const now = useMemo(() => new Date(nowIso), [nowIso]);

  const [index, setIndex] = useState(0);
  // Prospects handled in this session — dropped from the queue without a
  // round trip, so logging a call advances instantly.
  const [done, setDone] = useState<Set<string>>(new Set());
  const [disposition, setDisposition] = useState('');
  const [spoke, setSpoke] = useState(false);
  const [note, setNote] = useState('');
  const [nextAt, setNextAt] = useState('');
  const [busy, setBusy] = useState(false);

  const queue = useMemo(
    () => prospects.filter((p) => !done.has(p.id)),
    [prospects, done],
  );
  const p = queue[Math.min(index, Math.max(queue.length - 1, 0))] ?? null;

  function reset() {
    setDisposition('');
    setSpoke(false);
    setNote('');
    setNextAt('');
  }

  function advance(id?: string) {
    reset();
    if (id) setDone((prev) => new Set(prev).add(id));
    else setIndex((i) => i + 1);
  }

  async function log(outcome: string) {
    if (!p || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/outreach/prospects/${p.id}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disposition: outcome,
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
      toast.success(
        `Logged · ${STATUS_LABEL[outcome as keyof typeof STATUS_LABEL] ?? outcome}`,
        body.retired ? 'Retired — no answer after repeated dials.' : undefined,
      );
      advance(p.id);
      router.refresh();
    } catch {
      toast.error("Couldn't log call", 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  if (!p) {
    return (
      <EmptyState
        title="Queue clear"
        description="Nothing left to dial. Add prospects or import a list to keep going."
      />
    );
  }

  const due = dueState(p.nextActionAt, now);
  const local = localTimeForPhone(p.phone, now);
  const position = prospects.length - queue.length + 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
          {position} of {prospects.length}
        </span>
        <Link
          href="/outreach/dashboard"
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          Back to list
        </Link>
      </div>

      <article className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={STATUS_LABEL[p.status]} tone={STATUS_TONE[p.status]} size="sm" />
          {due ? <StatusPill label={DUE_LABEL[due]} tone={DUE_TONE[due]} size="sm" /> : null}
          {p.attempts > 0 ? (
            <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
              {p.attempts} {p.attempts === 1 ? 'dial' : 'dials'}
            </span>
          ) : null}
        </div>

        <h2 className="mt-2 font-display text-3xl font-medium tracking-tight text-ink">
          {p.company || p.fullName}
        </h2>
        {p.company ? (
          <p className="mt-0.5 font-sans text-sm text-ink-muted">{p.fullName}</p>
        ) : null}

        {p.phone ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}
              className="font-mono text-2xl tabular-nums text-copper hover:underline"
            >
              {p.phone}
            </a>
            {local ? (
              <span
                className={`font-mono text-[10px] uppercase tracking-meta ${
                  local.offHours ? 'text-danger' : 'text-ink-subtle'
                }`}
              >
                {local.label} local{local.offHours ? ' · off hours' : ''}
              </span>
            ) : null}
          </div>
        ) : null}

        <dl className="mt-4 space-y-1.5 font-sans text-sm">
          {p.website ? (
            <div>
              <dt className="inline text-ink-subtle">Site · </dt>
              <dd className="inline">
                <a
                  href={p.website.startsWith('http') ? p.website : `https://${p.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-copper hover:underline"
                >
                  {p.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              </dd>
            </div>
          ) : null}
          {p.websiteProblem ? (
            <div>
              <dt className="inline text-ink-subtle">Angle · </dt>
              <dd className="inline text-ink">{p.websiteProblem}</dd>
            </div>
          ) : null}
          {p.industry ? (
            <div>
              <dt className="inline text-ink-subtle">Industry · </dt>
              <dd className="inline text-ink-muted">{p.industry}</dd>
            </div>
          ) : null}
          {p.notes ? (
            <div>
              <dt className="inline text-ink-subtle">Notes · </dt>
              <dd className="inline text-ink-muted">{p.notes}</dd>
            </div>
          ) : null}
        </dl>

        {p.history.length > 0 ? (
          <div className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5">
            <p className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
              Last {p.history.length} {p.history.length === 1 ? 'dial' : 'dials'}
            </p>
            <ul className="mt-1.5 space-y-1">
              {p.history.map((c) => (
                <li key={c.id} className="font-sans text-xs text-ink-muted">
                  <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                    {formatDate(c.calledAt)}
                  </span>{' '}
                  {STATUS_LABEL[c.disposition]}
                  {c.note ? <span className="text-ink"> — {c.note}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </article>

      <ScriptPanel script={script} objections={objections} defaultOpen />

      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap gap-2">
          {LOG_DISPOSITIONS.filter((d) => PRIMARY.includes(d)).map((d) => (
            <Button
              key={d}
              type="button"
              variant={d === 'booked' ? 'primary' : 'secondary'}
              size="sm"
              disabled={busy}
              onClick={() => void log(d)}
            >
              {STATUS_LABEL[d]}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
        </div>

        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={4000}
          placeholder="What they actually said…"
          className="h-9"
        />

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <select
            value={disposition}
            onChange={(e) => {
              const v = e.target.value;
              setDisposition(v);
              if (v) void log(v);
            }}
            disabled={busy}
            aria-label="Other outcome"
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-ink focus-visible:border-copper focus-visible:outline-none"
          >
            <option value="">Other outcome…</option>
            {LOG_DISPOSITIONS.filter((d) => !PRIMARY.includes(d)).map((d) => (
              <option key={d} value={d}>
                {STATUS_LABEL[d]}
              </option>
            ))}
          </select>
          <BookAppointmentButton prospect={p} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || index >= queue.length - 1}
            onClick={() => advance()}
            className="ml-auto"
          >
            Skip
          </Button>
        </div>
      </section>
    </div>
  );
}
