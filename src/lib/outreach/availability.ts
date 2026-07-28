import 'server-only';
import { getOwnerUserId } from '@/lib/queries/outreach';
import { freeBusy } from '@/lib/google/calendar';

/**
 * Open-slot generation for appointment booking. Candidate slots are the
 * owner's business hours (below), converted to UTC, then filtered against
 * their Google Calendar busy times. If the calendar isn't connected, all
 * business-hour slots are offered (no availability filtering).
 *
 * Business hours are a constant for now (Eastern, Mon–Fri 9–5); easy to lift
 * into outreach_settings later.
 */
const TZ = 'America/New_York';
const DAY_START_H = 9; // 9:00
const DAY_END_H = 17; // last slot must END by 17:00
const STEP_MIN = 30;
const MAX_SLOTS = 40;
const LEAD_MS = 60 * 60 * 1000; // don't offer slots within the next hour

export type Slot = { startIso: string; label: string };

/** ms the tz is ahead of UTC at `date` (handles DST). */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) if (p.type !== 'literal') m[p.type] = p.value;
  const asUtc = Date.UTC(
    +m.year,
    +m.month - 1,
    +m.day,
    +m.hour,
    +m.minute,
    +m.second,
  );
  return asUtc - date.getTime();
}

/** The UTC instant for a wall-clock time in `tz`. */
function zonedWallToUtc(
  y: number,
  moIndex: number,
  d: number,
  hh: number,
  mm: number,
  tz: string,
): number {
  const guess = Date.UTC(y, moIndex, d, hh, mm);
  const off = tzOffsetMs(new Date(guess), tz);
  return guess - off;
}

export async function getAvailableSlots(opts: {
  durationMin: number;
  days: number;
}): Promise<Slot[]> {
  const durationMin = Math.min(600, Math.max(5, opts.durationMin || 30));
  const days = Math.min(21, Math.max(1, opts.days || 10));
  const now = Date.now();

  const ownerId = await getOwnerUserId();
  const busy = ownerId
    ? await freeBusy(
        ownerId,
        new Date(now).toISOString(),
        new Date(now + days * 24 * 60 * 60 * 1000).toISOString(),
      )
    : [];

  const labelFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });

  const slots: Slot[] = [];
  for (let dayOffset = 0; dayOffset < days && slots.length < MAX_SLOTS; dayOffset++) {
    const parts: Record<string, string> = {};
    for (const p of dateFmt.formatToParts(new Date(now + dayOffset * 86_400_000))) {
      if (p.type !== 'literal') parts[p.type] = p.value;
    }
    if (parts.weekday === 'Sat' || parts.weekday === 'Sun') continue;
    const y = +parts.year;
    const mo = +parts.month - 1;
    const d = +parts.day;

    for (let h = DAY_START_H; h < DAY_END_H; h++) {
      for (let mm = 0; mm < 60; mm += STEP_MIN) {
        if (h * 60 + mm + durationMin > DAY_END_H * 60) continue;
        const startUtc = zonedWallToUtc(y, mo, d, h, mm, TZ);
        if (startUtc < now + LEAD_MS) continue;
        const endUtc = startUtc + durationMin * 60_000;
        const clash = busy.some((b) => startUtc < b.end && endUtc > b.start);
        if (clash) continue;
        slots.push({
          startIso: new Date(startUtc).toISOString(),
          label: labelFmt.format(new Date(startUtc)),
        });
        if (slots.length >= MAX_SLOTS) break;
      }
      if (slots.length >= MAX_SLOTS) break;
    }
  }
  return slots;
}
