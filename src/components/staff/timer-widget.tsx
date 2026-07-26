'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import type { RunningTimer } from '@/lib/queries/admin';

function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Start/stop stopwatch for the current project. State is server-driven
 * (`running` prop from getRunningTimerForUser); actions refresh the route.
 * One running timer per contractor, so a timer on another project blocks
 * starting here until it's stopped.
 */
export function TimerWidget({
  projectId,
  running,
}: {
  projectId: string;
  running: RunningTimer | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  const isHere = running?.projectId === projectId;

  // Tick once a second while a timer for THIS project is running.
  useEffect(() => {
    if (!isHere) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [isHere]);

  async function start() {
    setBusy(true);
    try {
      const res = await fetch('/api/staff/timer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, note: note.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't start timer", body.error ?? 'Try again.');
        return;
      }
      setNote('');
      router.refresh();
    } catch {
      toast.error("Couldn't start timer", 'Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      const res = await fetch('/api/staff/timer/stop', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't stop timer", body.error ?? 'Try again.');
        return;
      }
      toast.success('Time logged', `${body.hours} h recorded.`);
      router.refresh();
    } catch {
      toast.error("Couldn't stop timer", 'Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  // Running on THIS project.
  if (isHere && running) {
    const elapsedMs =
      now != null ? now - new Date(running.startedAt).getTime() : 0;
    return (
      <div className="rounded-xl border border-copper/30 bg-copper-soft/20 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-meta text-copper">
              Timer running
            </p>
            <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-ink">
              {formatElapsed(elapsedMs)}
            </p>
            {running.note ? (
              <p className="mt-1 font-sans text-xs text-ink-muted">{running.note}</p>
            ) : null}
          </div>
          <Button variant="secondary" onClick={stop} disabled={busy}>
            {busy ? 'Stopping…' : 'Stop & log'}
          </Button>
        </div>
      </div>
    );
  }

  // Running on a DIFFERENT project.
  if (running && !isHere) {
    return (
      <div className="rounded-xl border border-border bg-surface-2/40 p-5">
        <p className="font-sans text-sm text-ink">
          You have a timer running on{' '}
          <span className="font-medium">{running.projectName}</span>.
        </p>
        <p className="mt-1 font-sans text-xs text-ink-muted">
          Stop it before starting one here.
        </p>
        <Button variant="secondary" size="sm" onClick={stop} disabled={busy} className="mt-3">
          {busy ? 'Stopping…' : `Stop ${running.projectName} timer`}
        </Button>
      </div>
    );
  }

  // No timer — offer to start.
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <label htmlFor="timer_note" className="block font-sans text-xs font-medium tracking-wide text-ink">
        Start a timer
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input
          id="timer_note"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What are you working on? (optional)"
          className="flex-1"
        />
        <Button onClick={start} disabled={busy}>
          {busy ? 'Starting…' : 'Start'}
        </Button>
      </div>
    </div>
  );
}
