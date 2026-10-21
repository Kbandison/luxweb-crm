import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { AgentUpdateAppointmentSchema } from '@/lib/validation/agent';
import { agentGate, VIA_AGENT } from '@/lib/outreach/agent-gate';
import {
  bookingWindowError,
  overlapsAny,
  subtractInterval,
} from '@/lib/outreach/agent-rules';
import {
  deleteCalendarEvent,
  freeBusy,
  updateCalendarEventTime,
} from '@/lib/google/calendar';

export const runtime = 'nodejs';

type ApptRow = {
  status: string;
  scheduled_at: string;
  duration_min: number | null;
  assigned_to: string | null;
  google_event_id: string | null;
};

/**
 * PATCH /api/agent/appointments/[id] — move a call, cancel it, or update its
 * notes. Moving checks the new slot is free and updates the calendar event
 * (Google emails the invitee the new time); if the calendar can't be updated
 * the move isn't recorded, so the CRM and the invite never disagree.
 * Canceling removes the event (Google sends the cancellation) and keeps the
 * row as 'canceled' for the record. Showed / no-show / won / lost are Kevin's.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await agentGate(req, 'appointments');
    if (gate instanceof Response) return gate;
    const { id } = await params;

    const raw = await req.json().catch(() => ({}));
    const parsed = AgentUpdateAppointmentSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const sb = supabaseAdmin();
    const { data } = await sb
      .from('appointments')
      .select('status, scheduled_at, duration_min, assigned_to, google_event_id')
      .eq('id', id)
      .maybeSingle();
    if (!data) return Response.json({ error: 'Not found' }, { status: 404 });
    const appt = data as ApptRow;

    if (appt.status !== 'scheduled') {
      return Response.json(
        { error: `This call is ${appt.status}; only scheduled calls can change.` },
        { status: 409 },
      );
    }

    const patch: Record<string, unknown> = {};
    if ('notes' in d) patch.notes = d.notes ?? null;

    if (d.status === 'canceled') {
      if (appt.google_event_id && appt.assigned_to) {
        await deleteCalendarEvent(appt.assigned_to, appt.google_event_id);
      }
      patch.status = 'canceled';
      patch.google_event_id = null;
    } else if (d.scheduled_at || d.duration_min) {
      const oldStart = new Date(appt.scheduled_at).getTime();
      const oldDuration = appt.duration_min ?? 30;
      const startMs = d.scheduled_at ? new Date(d.scheduled_at).getTime() : oldStart;
      const durationMin = d.duration_min ?? oldDuration;

      const windowError = bookingWindowError(startMs, Date.now());
      if (windowError) return Response.json({ error: windowError }, { status: 400 });

      const startIso = new Date(startMs).toISOString();
      const endIso = new Date(startMs + durationMin * 60_000).toISOString();
      const ownerId = appt.assigned_to ?? gate.ownerId;

      // This call's own slot is busy on the calendar; it doesn't block a move.
      const busy = subtractInterval(await freeBusy(ownerId, startIso, endIso), {
        start: oldStart,
        end: oldStart + oldDuration * 60_000,
      });
      if (overlapsAny(busy, { start: startMs, end: startMs + durationMin * 60_000 })) {
        return Response.json(
          { error: 'Kevin is busy then. Pick another slot from /api/agent/availability.' },
          { status: 409 },
        );
      }

      if (appt.google_event_id) {
        const moved = await updateCalendarEventTime(ownerId, appt.google_event_id, startIso, endIso);
        if (!moved) {
          return Response.json(
            { error: 'Could not update the calendar invite, so the call was not moved.' },
            { status: 502 },
          );
        }
      }
      patch.scheduled_at = startIso;
      patch.duration_min = durationMin;
    }

    if (Object.keys(patch).length === 0) return Response.json({ ok: true });

    const { error } = await sb.from('appointments').update(patch).eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: gate.ownerId,
      action: 'update',
      entity_type: 'appointment',
      entity_id: id,
      diff: { ...patch, ...VIA_AGENT },
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('agent/appointments/[id] PATCH', err);
  }
}
