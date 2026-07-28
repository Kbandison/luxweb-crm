import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { UpdateAppointmentSchema } from '@/lib/validation/outreach';
import { getOutreachSettings } from '@/lib/queries/outreach';
import { deleteCalendarEvent } from '@/lib/google/calendar';

export const runtime = 'nodejs';

type ApptRow = {
  setter_id: string | null;
  assigned_to: string | null;
  deal_value_cents: number | null;
  google_event_id: string | null;
};

async function loadAppt(id: string): Promise<ApptRow | null> {
  const { data } = await supabaseAdmin()
    .from('appointments')
    .select('setter_id, assigned_to, deal_value_cents, google_event_id')
    .eq('id', id)
    .maybeSingle();
  return (data as ApptRow | null) ?? null;
}

/**
 * PATCH /api/outreach/appointments/[id] — record outcome. Owner/manager set
 * showed/result/deal value; on a 'won' result, commission is computed from
 * the deal value × the studio commission rate. Setters may only cancel their
 * own booking.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_outreach');
    const limit = limitByKey(`outreach/appts/[id]:${session.userId}`, {
      capacity: 60,
      refillPerSec: 60 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    const appt = await loadAppt(id);
    if (!appt) return Response.json({ error: 'Not found' }, { status: 404 });
    const isSetter = session.role === 'setter';
    if (isSetter && appt.setter_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = UpdateAppointmentSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const patch: Record<string, unknown> = {};
    if ('status' in parsed.data) patch.status = parsed.data.status;
    if ('notes' in parsed.data) patch.notes = parsed.data.notes ?? null;

    // Outcome + money are owner/manager only.
    if (!isSetter) {
      if ('result' in parsed.data) patch.result = parsed.data.result;
      if ('deal_value_cents' in parsed.data) patch.deal_value_cents = parsed.data.deal_value_cents ?? null;

      const effectiveResult = parsed.data.result;
      if (effectiveResult === 'won') {
        const dealValue =
          parsed.data.deal_value_cents ?? appt.deal_value_cents ?? 0;
        const { commissionRate } = await getOutreachSettings();
        patch.commission_cents = Math.round(dealValue * commissionRate);
      } else if (effectiveResult === 'lost' || effectiveResult === 'pending') {
        patch.commission_cents = 0;
      }
    } else {
      // A setter can only cancel.
      if (patch.status && patch.status !== 'canceled') delete patch.status;
    }

    if (Object.keys(patch).length === 0) return Response.json({ ok: true });

    const { error } = await supabaseAdmin()
      .from('appointments')
      .update(patch)
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'appointment',
      entity_id: id,
      diff: patch,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/appointments/[id] PATCH', err);
  }
}

/** DELETE — cancel the booking and remove the calendar event (best-effort). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_outreach');
    const { id } = await params;
    const appt = await loadAppt(id);
    if (!appt) return Response.json({ error: 'Not found' }, { status: 404 });
    if (session.role === 'setter' && appt.setter_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    if (appt.google_event_id && appt.assigned_to) {
      await deleteCalendarEvent(appt.assigned_to, appt.google_event_id);
    }
    const { error } = await supabaseAdmin().from('appointments').delete().eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'appointment',
      entity_id: id,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/appointments/[id] DELETE', err);
  }
}
