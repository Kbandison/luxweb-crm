'use client';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { OutreachSettings } from '@/lib/queries/outreach';

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
];
const DAYS = [
  { n: 0, label: 'Sun' },
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
  { n: 6, label: 'Sat' },
];

function hourLabel(h: number): string {
  if (h === 0 || h === 24) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export function OutreachSettingsDrawer({ settings }: { settings: OutreachSettings }) {
  const router = useRouter();
  const toast = useToast();
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [tz, setTz] = useState(settings.slotTimezone);
  const [days, setDays] = useState<number[]>(settings.slotDays);
  const [startH, setStartH] = useState(String(settings.slotStartHour));
  const [endH, setEndH] = useState(String(settings.slotEndHour));
  const [dialTarget, setDialTarget] = useState(String(settings.dailyDialTarget));
  const [bookedTarget, setBookedTarget] = useState(String(settings.weeklyBookedTarget));
  const [commission, setCommission] = useState(String(Math.round(settings.commissionRate * 100)));

  const tzOptions = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];

  function toggleDay(n: number) {
    setDays((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort()));
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const start = Number(startH);
    const end = Number(endH);
    if (end <= start) {
      toast.error('Check the hours', 'End time must be after start time.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/outreach-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_timezone: tz,
          slot_days: days,
          slot_start_hour: start,
          slot_end_hour: end,
          daily_dial_target: Math.max(0, Math.round(Number(dialTarget) || 0)),
          weekly_booked_target: Math.max(0, Math.round(Number(bookedTarget) || 0)),
          commission_rate: Math.max(0, Math.min(100, Number(commission) || 0)) / 100,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't save", body.error ?? 'Try again.');
        return;
      }
      setOpen(false);
      toast.success('Settings saved');
      router.refresh();
    } catch {
      toast.error("Couldn't save", 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  const selCls =
    'flex h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink focus-visible:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30';

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Settings
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} side="right" width="md" labelledBy={headingId}>
        <header className="border-b border-border px-6 pb-5 pt-6">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
            Outreach
          </p>
          <h2 id={headingId} className="mt-1 font-display text-2xl font-medium tracking-tight text-ink">
            Settings
          </h2>
        </header>
        <form onSubmit={save} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            <div>
              <p className="mb-3 font-mono text-[10px] uppercase tracking-meta text-ink-muted">
                Booking availability
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="s_tz">Time zone</Label>
                  <select id="s_tz" value={tz} onChange={(e) => setTz(e.target.value)} className={selCls}>
                    {tzOptions.map((z) => (
                      <option key={z} value={z}>
                        {z.replace('America/', '').replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label>Days you take calls</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((day) => (
                      <button
                        key={day.n}
                        type="button"
                        onClick={() => toggleDay(day.n)}
                        className={cn(
                          'rounded-md border px-3 py-1.5 font-sans text-xs font-medium transition-colors',
                          days.includes(day.n)
                            ? 'border-copper bg-copper-soft/40 text-ink'
                            : 'border-border bg-surface text-ink-muted hover:border-border-strong',
                        )}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="s_start">Earliest</Label>
                    <select id="s_start" value={startH} onChange={(e) => setStartH(e.target.value)} className={selCls}>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{hourLabel(h)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s_end">Latest</Label>
                    <select id="s_end" value={endH} onChange={(e) => setEndH(e.target.value)} className={selCls}>
                      {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                        <option key={h} value={h}>{hourLabel(h)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="font-sans text-xs text-ink-subtle">
                  Setters only see open slots inside this window (and your calendar&apos;s free times).
                </p>
              </div>
            </div>

            <div>
              <p className="mb-3 font-mono text-[10px] uppercase tracking-meta text-ink-muted">
                Targets &amp; commission
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="s_dials">Daily dial target</Label>
                  <Input id="s_dials" type="number" min={0} value={dialTarget} onChange={(e) => setDialTarget(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s_booked">Weekly booked target</Label>
                  <Input id="s_booked" type="number" min={0} value={bookedTarget} onChange={(e) => setBookedTarget(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s_comm">Commission rate (%)</Label>
                  <Input id="s_comm" type="number" min={0} max={100} step="0.5" value={commission} onChange={(e) => setCommission(e.target.value)} />
                </div>
              </div>
            </div>
          </div>
          <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface px-6 py-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || days.length === 0}>{busy ? 'Saving…' : 'Save'}</Button>
          </footer>
        </form>
      </Drawer>
    </>
  );
}
