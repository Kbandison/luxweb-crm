'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export type RunningTimerSnapshot = {
  id: string;
  projectId: string;
  projectName: string;
  note: string | null;
  startedAt: string;
};

export function TimerStrip({
  projectId,
  running,
}: {
  projectId: string;
  running: RunningTimerSnapshot | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(running?.note ?? '');
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  // Tick every second so the elapsed display updates while a timer runs.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [running]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/timer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          note: note.trim() || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Failed to start timer');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/timer/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() || null }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Failed to stop timer');
        return;
      }
      setNote('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/timer/discard', { method: 'POST' });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Failed to discard timer');
        return;
      }
      setNote('');
      setConfirmingDiscard(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Running timer on a DIFFERENT project — show a switch banner.
  if (running && running.projectId !== projectId) {
    return (
      <section className="rounded-2xl border border-warning/30 bg-warning/5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-warning">
              Timer running elsewhere
            </p>
            <p className="mt-1 font-sans text-sm text-ink">
              You have a timer running on{' '}
              <Link
                href={`/admin/projects/${running.projectId}/time`}
                className="font-medium text-copper hover:underline"
              >
                {running.projectName}
              </Link>
              .
            </p>
            <p className="mt-1 font-mono text-xs tabular-nums text-ink-muted">
              {formatElapsed(now - new Date(running.startedAt).getTime())}
            </p>
          </div>
          <Link
            href={`/admin/projects/${running.projectId}/time`}
            className="shrink-0"
          >
            <Button variant="ghost" size="sm">
              View
            </Button>
          </Link>
        </div>
      </section>
    );
  }

  // Running on THIS project — show stop UI with live elapsed.
  if (running && running.projectId === projectId) {
    const elapsedMs = now - new Date(running.startedAt).getTime();
    return (
      <section className="space-y-4 rounded-2xl border border-copper/40 bg-copper-soft/30 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-copper">
              Timer running
            </p>
            <p className="mt-2 font-mono text-3xl font-medium tabular-nums tracking-tight text-ink">
              {formatElapsed(elapsedMs)}
            </p>
          </div>
          <span aria-hidden className="relative flex h-3 w-3 mt-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-copper opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-copper" />
          </span>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="timer_note">Note (optional)</Label>
          <Input
            id="timer_note"
            placeholder="What are you working on?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 font-sans text-sm text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setConfirmingDiscard(true)}
            disabled={busy}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-danger disabled:opacity-50"
          >
            Discard
          </button>
          <Button onClick={stop} disabled={busy}>
            {busy ? 'Stopping…' : 'Stop & log time'}
          </Button>
        </div>

        <ConfirmDialog
          open={confirmingDiscard}
          title="Discard this timer?"
          description="The elapsed time will not be logged. This can't be undone."
          confirmLabel="Discard"
          tone="danger"
          busy={busy}
          onCancel={() => setConfirmingDiscard(false)}
          onConfirm={discard}
        />
      </section>
    );
  }

  // Idle — no timer running anywhere.
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-copper">
            Timer
          </p>
          <p className="mt-1 font-sans text-sm text-ink-muted">
            Start a timer to track time as you work. Stop logs the elapsed
            duration as a time entry.
          </p>
        </div>
        <Button onClick={start} disabled={busy}>
          {busy ? 'Starting…' : 'Start timer'}
        </Button>
      </div>
      {error ? (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
