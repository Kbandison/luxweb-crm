'use client';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import type { DayHours, OutreachSettings } from '@/lib/queries/outreach';

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
  const [hours, setHours] = useState<Record<number, DayHours>>(() => ({ ...settings.slotHours }));
  const [dialTarget, setDialTarget] = useState(String(settings.dailyDialTarget));
  const [bookedTarget, setBookedTarget] = useState(String(settings.weeklyBookedTarget));
  const [commission, setCommission] = useState(String(Math.round(settings.commissionRate * 100)));
  const [retireAfter, setRetireAfter] = useState(String(settings.autoRetireAfter));
  const [script, setScript] = useState(settings.callScript);
  const [objections, setObjections] = useState(settings.objectionNotes);

  const tzOptions = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];

  function toggleDay(n: number) {
    setHours((cur) => {
      const next = { ...cur };
      if (next[n]) delete next[n];
      else next[n] = { start: 9, end: 17 };
      return next;
    });
  }
  function setDay(n: number, field: 'start' | 'end', val: number) {
    setHours((cur) => ({ ...cur, [n]: { ...cur[n], [field]: val } }));
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    for (const [day, hrs] of Object.entries(hours)) {
      if (hrs.end <= hrs.start) {
        toast.error('Check the hours', `End must be after start on ${DAYS[+day].label}.`);
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/outreach-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_timezone: tz,
          slot_hours: hours,
          daily_dial_target: Math.max(0, Math.round(Number(dialTarget) || 0)),
          weekly_booked_target: Math.max(0, Math.round(Number(bookedTarget) || 0)),
          commission_rate: Math.max(0, Math.min(100, Number(commission) || 0)) / 100,
          auto_retire_after: Math.max(0, Math.min(50, Math.round(Number(retireAfter) || 0))),
          call_script: script.trim() || null,
          objection_notes: objections.trim() || null,
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
    'h-9 rounded-md border border-border bg-surface px-2 text-sm text-ink focus-visible:border-copper focus-visible:outline-none';
  const openCount = Object.keys(hours).length;

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
                  <select
                    id="s_tz"
                    value={tz}
                    onChange={(e) => setTz(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink focus-visible:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
                  >
                    {tzOptions.map((z) => (
                      <option key={z} value={z}>
                        {z.replace('America/', '').replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label>Hours you take calls</Label>
                  <div className="divide-y divide-border/60 rounded-lg border border-border">
                    {DAYS.map((day) => {
                      const dh = hours[day.n];
                      return (
                        <div key={day.n} className="flex items-center gap-3 px-3 py-2">
                          <label className="flex w-20 shrink-0 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!!dh}
                              onChange={() => toggleDay(day.n)}
                              className="h-4 w-4 accent-copper"
                            />
                            <span className="font-sans text-sm text-ink">{day.label}</span>
                          </label>
                          {dh ? (
                            <div className="flex items-center gap-2">
                              <select
                                aria-label={`${day.label} start`}
                                value={dh.start}
                                onChange={(e) => setDay(day.n, 'start', Number(e.target.value))}
                                className={selCls}
                              >
                                {Array.from({ length: 24 }, (_, h) => (
                                  <option key={h} value={h}>{hourLabel(h)}</option>
                                ))}
                              </select>
                              <span className="font-sans text-xs text-ink-subtle">to</span>
                              <select
                                aria-label={`${day.label} end`}
                                value={dh.end}
                                onChange={(e) => setDay(day.n, 'end', Number(e.target.value))}
                                className={selCls}
                              >
                                {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                                  <option key={h} value={h}>{hourLabel(h)}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <span className="font-sans text-xs text-ink-subtle">Closed</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="font-sans text-xs text-ink-subtle">
                    Setters only see open slots inside these hours (and your calendar&apos;s free times).
                  </p>
                </div>
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
                <div className="space-y-1.5">
                  <Label htmlFor="s_retire">Retire after N no-answers</Label>
                  <Input id="s_retire" type="number" min={0} max={50} value={retireAfter} onChange={(e) => setRetireAfter(e.target.value)} />
                  <p className="font-sans text-xs text-ink-subtle">0 = never retire.</p>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-3 font-mono text-[10px] uppercase tracking-meta text-ink-muted">
                Script &amp; objections
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="s_script">Call script</Label>
                  <textarea
                    id="s_script"
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    rows={8}
                    maxLength={8000}
                    placeholder={'Hi, is this the owner?\n\nI build websites for [industry] and noticed…'}
                    className="flex w-full rounded-md border border-border bg-surface px-3 py-2 font-sans text-sm text-ink focus-visible:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s_objections">Objection handling</Label>
                  <textarea
                    id="s_objections"
                    value={objections}
                    onChange={(e) => setObjections(e.target.value)}
                    rows={6}
                    maxLength={8000}
                    placeholder={'"Not interested" → Totally fair. Can I ask…\n"Send me an email" → Happy to…'}
                    className="flex w-full rounded-md border border-border bg-surface px-3 py-2 font-sans text-sm text-ink focus-visible:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
                  />
                </div>
                <p className="font-sans text-xs text-ink-subtle">
                  Both show on the setter&apos;s dashboard and stay pinned in dial mode.
                </p>
              </div>
            </div>
          </div>
          <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface px-6 py-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || openCount === 0}>{busy ? 'Saving…' : 'Save'}</Button>
          </footer>
        </form>
      </Drawer>
    </>
  );
}
