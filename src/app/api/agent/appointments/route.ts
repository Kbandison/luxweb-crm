import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { AgentBookSchema } from '@/lib/validation/agent';
import { agentGate, VIA_AGENT } from '@/lib/outreach/agent-gate';
import { bookingWindowError, overlapsAny } from '@/lib/outreach/agent-rules';
import { createCalendarEvent, freeBusy } from '@/lib/google/calendar';
import { promoteProspectToLead } from '@/lib/outreach/promote';
import type { ProspectStatus } from '@/lib/outreach/meta';

export const runtime = 'nodejs';

/**
 * POST /api/agent/appointments — the assistant books a discovery call. It
 * does what a setter's booking does, in one step: the event on the owner's
 * calendar with the invite, the appointment row, a 'booked' entry in the
 * prospect's history, and the prospect promoted to a contact + deal.
 *
 * Two guards a setter's booking doesn't need, because nobody is watching:
 *   - the slot must be free on the owner's calendar (409 if not), and
 *   - a retry is harmless: the same person at the same time returns the
 *     booking that already exists instead of a second one and a second invite.
 *
 * Without a prospect_id it books for someone who isn't on the call list (a
 * website lead, say); the caller moves their deal to 'discovery' separately.
 */
export async function POST(req: Request) {
  try {
    const gate = await agentGate(req, 'appointments');
    if (gate instanceof Response) return gate;

    const raw = await req.json().catch(() => ({}));
    const parsed = AgentBookSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const startMs = new Date(d.scheduled_at).getTime();
    const windowError = bookingWindowError(startMs, Date.now());
    if (windowError) return Response.json({ error: windowError }, { status: 400 });
    const durationMin = d.duration_min ?? 30;
    const startIso = new Date(startMs).toISOString();
    const endIso = new Date(startMs + durationMin * 60_000).toISOString();

    const sb = supabaseAdmin();

    if (d.prospect_id) {
      const { data: prospect } = await sb
        .from('prospects')
        .select('status')
        .eq('id', d.prospect_id)
        .maybeSingle();
      if (!prospect) return Response.json({ error: 'Prospect not found' }, { status: 404 });
      if ((prospect as { status: ProspectStatus }).status === 'dnc') {
        return Response.json(
          { error: 'This prospect is marked do-not-contact.' },
          { status: 409 },
        );
      }
    }

    // Retry safety: the same person already booked at this exact time.
    let existingQuery = sb
      .from('appointments')
      .select('id, google_event_id')
      .eq('scheduled_at', startIso)
      .eq('status', 'scheduled');
    if (d.prospect_id) {
      existingQuery = existingQuery.eq('prospect_id', d.prospect_id);
    } else if (d.email) {
      // ilike for case-insensitive equality; escape its wildcards, which
      // are legal in email addresses.
      existingQuery = existingQuery.ilike('email', d.email.trim().replace(/[\\%_]/g, '\\$&'));
    } else {
      existingQuery = existingQuery.eq('contact_name', d.contact_name);
    }
    const { data: existing } = await existingQuery.limit(1).maybeSingle();
    if (existing) {
      const e = existing as { id: string; google_event_id: string | null };
      return Response.json({
        id: e.id,
        synced: Boolean(e.google_event_id),
        already_booked: true,
      });
    }

    const busy = await freeBusy(gate.ownerId, startIso, endIso);
    if (overlapsAny(busy, { start: startMs, end: startMs + durationMin * 60_000 })) {
      return Response.json(
        { error: 'Kevin is busy then. Pick another slot from /api/agent/availability.' },
        { status: 409 },
      );
    }

    // The invitee sees the description, so the booking notes (internal) stay
    // on the appointment row, not the event.
    const googleEventId = await createCalendarEvent(gate.ownerId, {
      summary: `Discovery call — ${d.business_name ?? d.contact_name}`,
      description: ['Discovery call with LuxWeb Studio.', d.phone ? `Phone: ${d.phone}` : null]
        .filter(Boolean)
        .join('\n'),
      startIso,
      endIso,
      attendeeEmail: d.email ?? null,
    });

    const { data, error } = await sb
      .from('appointments')
      .insert({
        prospect_id: d.prospect_id ?? null,
        setter_id: gate.ownerId,
        assigned_to: gate.ownerId,
        business_name: d.business_name ?? null,
        contact_name: d.contact_name,
        phone: d.phone ?? null,
        email: d.email ?? null,
        scheduled_at: startIso,
        duration_min: durationMin,
        google_event_id: googleEventId,
        notes: d.notes ?? null,
      })
      .select('id')
      .single();
    if (error || !data) {
      return Response.json({ error: error?.message ?? 'Could not book' }, { status: 500 });
    }
    const appointmentId = (data as { id: string }).id;

    await writeAudit({
      actor_id: gate.ownerId,
      action: 'create',
      entity_type: 'appointment',
      entity_id: appointmentId,
      diff: { synced: Boolean(googleEventId), ...VIA_AGENT },
    });

    // The rest of a setter's booking: history row, status, promotion.
    let convertedContactId: string | null = null;
    if (d.prospect_id) {
      const nowIso = new Date().toISOString();
      await sb.from('prospect_calls').insert({
        prospect_id: d.prospect_id,
        setter_id: gate.ownerId,
        channel: 'email',
        disposition: 'booked',
        spoke_with_dm: false,
        note: `Discovery call booked for ${startIso}`,
        called_at: nowIso,
      });
      await sb
        .from('prospects')
        .update({ status: 'booked', last_contacted_at: nowIso, next_action: null, next_action_at: null })
        .eq('id', d.prospect_id);
      convertedContactId = await promoteProspectToLead(d.prospect_id, gate.ownerId);
    }

    return Response.json({
      id: appointmentId,
      synced: Boolean(googleEventId),
      converted_contact_id: convertedContactId,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('agent/appointments POST', err);
  }
}
