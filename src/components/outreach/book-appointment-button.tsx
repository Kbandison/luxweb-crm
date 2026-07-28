'use client';
import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { ProspectRow } from '@/lib/queries/outreach';

type Slot = { startIso: string; label: string };

/** Book a discovery call from a prospect. Offers open slots on the owner's
 *  calendar (busy times filtered out); a custom time is available as a
 *  fallback. Creates the appointment + calendar event + invite. */
export function BookAppointmentButton({ prospect }: { prospect: ProspectRow }) {
  const router = useRouter();
  const toast = useToast();
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState('30');
  const [notes, setNotes] = useState('');

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedIso, setSelectedIso] = useState('');
  const [customWhen, setCustomWhen] = useState('');

  // Load open slots when the drawer opens or the duration changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingSlots(true);
    fetch(`/api/outreach/availability?duration=${Number(duration) || 30}`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setSlots((body.slots as Slot[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, duration]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const scheduledAt = selectedIso || (customWhen ? new Date(customWhen).toISOString() : '');
    if (!scheduledAt) {
      toast.error('Pick a time', 'Choose a slot or set a custom time.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/outreach/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_id: prospect.id,
          business_name: prospect.company,
          contact_name: prospect.fullName,
          phone: prospect.phone,
          email: prospect.email,
          scheduled_at: scheduledAt,
          duration_min: Number(duration) || 30,
          notes: notes.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't book", body.error ?? 'Try again.');
        return;
      }
      setOpen(false);
      setSelectedIso('');
      setCustomWhen('');
      setNotes('');
      toast.success(
        'Appointment booked',
        body.synced ? 'On the calendar + invite sent.' : 'Saved (calendar not connected).',
      );
      router.refresh();
    } catch {
      toast.error("Couldn't book", 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="primary" size="sm" onClick={() => setOpen(true)}>
        Book
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} side="right" width="sm" labelledBy={headingId}>
        <header className="border-b border-border px-6 pb-5 pt-6">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
            Book appointment
          </p>
          <h2 id={headingId} className="mt-1 font-display text-2xl font-medium tracking-tight text-ink">
            {prospect.company ?? prospect.fullName}
          </h2>
          <p className="mt-1 font-sans text-xs text-ink-muted">
            {prospect.fullName}
            {prospect.email ? ` · ${prospect.email}` : ''}
          </p>
        </header>
        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
            <div className="space-y-1.5">
              <Label htmlFor="appt_dur">Duration (min)</Label>
              <select
                id="appt_dur"
                value={duration}
                onChange={(e) => {
                  setDuration(e.target.value);
                  setSelectedIso('');
                }}
                className="flex h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink focus-visible:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
              >
                <option value="15">15</option>
                <option value="30">30</option>
                <option value="45">45</option>
                <option value="60">60</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Open times</Label>
              {loadingSlots ? (
                <p className="font-sans text-xs text-ink-subtle">Checking the calendar…</p>
              ) : slots.length === 0 ? (
                <p className="font-sans text-xs text-ink-subtle">
                  No open business-hour slots found — use a custom time below.
                </p>
              ) : (
                <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto">
                  {slots.map((s) => (
                    <button
                      key={s.startIso}
                      type="button"
                      onClick={() => {
                        setSelectedIso(s.startIso);
                        setCustomWhen('');
                      }}
                      className={cn(
                        'rounded-md border px-3 py-2 text-left font-sans text-sm transition-colors',
                        selectedIso === s.startIso
                          ? 'border-copper bg-copper-soft/40 text-ink'
                          : 'border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink',
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="appt_custom">Or a custom time</Label>
              <Input
                id="appt_custom"
                type="datetime-local"
                value={customWhen}
                onChange={(e) => {
                  setCustomWhen(e.target.value);
                  setSelectedIso('');
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="appt_notes">Notes</Label>
              <textarea
                id="appt_notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Anything the owner should know before the call…"
                className="flex w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
              />
            </div>
            <p className="font-sans text-xs text-ink-subtle">
              Lands on the studio owner&apos;s calendar. The prospect gets an invite if a calendar is connected.
            </p>
          </div>
          <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface px-6 py-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || (!selectedIso && !customWhen)}>
              {busy ? 'Booking…' : 'Book'}
            </Button>
          </footer>
        </form>
      </Drawer>
    </>
  );
}
