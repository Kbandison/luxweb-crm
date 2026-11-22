import 'server-only';
import { accessTokenFor } from '@/lib/google/oauth';

/**
 * Minimal Google Calendar integration for the outreach module. The owner
 * connects their Google account once (see oauth.ts); booked appointments are
 * written to its calendar and the prospect is invited. No googleapis SDK —
 * plain fetch against the REST API.
 */

const CAL_BASE = 'https://www.googleapis.com/calendar/v3';

export type CalendarEventInput = {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  attendeeEmail?: string | null;
};

/**
 * Create an event on `userId`'s primary calendar. Returns the event id, or
 * null if they aren't connected / the call fails (booking still succeeds
 * locally — the calendar is a sync target, not the source of truth).
 */
export async function createCalendarEvent(
  userId: string,
  ev: CalendarEventInput,
): Promise<string | null> {
  try {
    const token = await accessTokenFor(userId);
    if (!token) return null;
    const body: Record<string, unknown> = {
      summary: ev.summary,
      description: ev.description,
      start: { dateTime: ev.startIso },
      end: { dateTime: ev.endIso },
    };
    if (ev.attendeeEmail) body.attendees = [{ email: ev.attendeeEmail }];
    const res = await fetch(
      `${CAL_BASE}/calendars/primary/events?sendUpdates=all`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      console.warn('[google] create event failed:', res.status, await res.text());
      return null;
    }
    return ((await res.json()) as { id?: string }).id ?? null;
  } catch (err) {
    console.warn('[google] create event error:', err);
    return null;
  }
}

export type BusyInterval = { start: number; end: number };

/**
 * Busy intervals on `userId`'s primary calendar in [timeMin, timeMax].
 * Returns [] when they aren't connected or the call fails (callers then treat
 * every business-hour slot as open).
 */
export async function freeBusy(
  userId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<BusyInterval[]> {
  try {
    const token = await accessTokenFor(userId);
    if (!token) return [];
    const res = await fetch(`${CAL_BASE}/freeBusy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: timeMinIso,
        timeMax: timeMaxIso,
        items: [{ id: 'primary' }],
      }),
    });
    if (!res.ok) {
      console.warn('[google] freeBusy failed:', res.status);
      return [];
    }
    const data = (await res.json()) as {
      calendars?: { primary?: { busy?: { start: string; end: string }[] } };
    };
    const busy = data.calendars?.primary?.busy ?? [];
    return busy.map((b) => ({
      start: new Date(b.start).getTime(),
      end: new Date(b.end).getTime(),
    }));
  } catch (err) {
    console.warn('[google] freeBusy error:', err);
    return [];
  }
}

/**
 * Move a previously-created event. Unlike create/delete this reports failure:
 * a reschedule that didn't reach the calendar would leave the invitee holding
 * the old time, so the caller must not record the move.
 */
export async function updateCalendarEventTime(
  userId: string,
  eventId: string,
  startIso: string,
  endIso: string,
): Promise<boolean> {
  try {
    const token = await accessTokenFor(userId);
    if (!token) return false;
    const res = await fetch(
      `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start: { dateTime: startIso },
          end: { dateTime: endIso },
        }),
      },
    );
    if (!res.ok) {
      console.warn('[google] update event failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[google] update event error:', err);
    return false;
  }
}

/** Delete a previously-created event (best-effort). */
export async function deleteCalendarEvent(
  userId: string,
  eventId: string,
): Promise<void> {
  try {
    const token = await accessTokenFor(userId);
    if (!token) return;
    await fetch(
      `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (err) {
    console.warn('[google] delete event error:', err);
  }
}
