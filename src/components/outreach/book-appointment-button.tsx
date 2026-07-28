'use client';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import type { ProspectRow } from '@/lib/queries/outreach';

/** Book a discovery call from a prospect. Creates the appointment (and, if
 *  the owner's Google Calendar is connected, the event + invite). */
export function BookAppointmentButton({ prospect }: { prospect: ProspectRow }) {
  const router = useRouter();
  const toast = useToast();
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [when, setWhen] = useState('');
  const [duration, setDuration] = useState('30');
  const [notes, setNotes] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!when) return;
    setBusy(true);
    try {
      const scheduledAt = new Date(when).toISOString();
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
      setWhen('');
      setNotes('');
      toast.success(
        'Appointment booked',
        body.synced ? 'Added to the calendar + invite sent.' : 'Saved (calendar not connected).',
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
              <Label htmlFor="appt_when">Date &amp; time</Label>
              <Input id="appt_when" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appt_dur">Duration (min)</Label>
              <Input id="appt_dur" type="number" min={5} max={600} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
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
            <Button type="submit" size="sm" disabled={busy || !when}>{busy ? 'Booking…' : 'Book'}</Button>
          </footer>
        </form>
      </Drawer>
    </>
  );
}
