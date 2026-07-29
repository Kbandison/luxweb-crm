import 'server-only';
import { getOwnerUserId, getOutreachSettings } from '@/lib/queries/outreach';
import { freeBusy } from '@/lib/google/calendar';

/**
 * Open-slot generation for appointment booking. Candidate slots are the
 * owner's configured availability (timezone / days / start–end hour, from
 * outreach_settings), converted to UTC, then filtered against their Google
 * Calendar busy times. If the calendar isn't connected, all in-hours slots
 * are offered (no busy filtering).
 */
const STEP_MIN = 30;
const MAX_SLOTS = 40;
const LEAD_MS = 60 * 60 * 1000; // don't offer slots within the next hour
const WEEKDAY_NUM: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

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

  const settings = await getOutreachSettings();
  const tz = settings.slotTimezone;
  const startH = settings.slotStartHour;
  const endH = settings.slotEndHour;
  const openDays = new Set(settings.slotDays);

  const ownerId = await getOwnerUserId();
  const busy = ownerId
    ? await freeBusy(
        ownerId,
        new Date(now).toISOString(),
        new Date(now + days * 24 * 60 * 60 * 1000).toISOString(),
      )
    : [];

  const labelFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
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
    if (!openDays.has(WEEKDAY_NUM[parts.weekday])) continue;
    const y = +parts.year;
    const mo = +parts.month - 1;
    const d = +parts.day;

    for (let h = startH; h < endH; h++) {
      for (let mm = 0; mm < 60; mm += STEP_MIN) {
        if (h * 60 + mm + durationMin > endH * 60) continue;
        const startUtc = zonedWallToUtc(y, mo, d, h, mm, tz);
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
