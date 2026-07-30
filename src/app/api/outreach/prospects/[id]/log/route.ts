import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { LogCallSchema } from '@/lib/validation/outreach';
import { promoteProspectToLead } from '@/lib/outreach/promote';
import { getOutreachSettings } from '@/lib/queries/outreach';

export const runtime = 'nodejs';

/**
 * POST /api/outreach/prospects/[id]/log — record a dial's outcome. Writes a
 * crm.prospect_calls row (history + Daily Numbers) and advances the prospect:
 * status = disposition, attempts += 1, last_contacted_at = now, and the next
 * callback if supplied. (Auto-convert on interested/booked arrives in 3B.)
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_outreach');
    const limit = limitByKey(`outreach/log:${session.userId}`, {
      capacity: 240,
      refillPerSec: 240 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    const raw = await req.json().catch(() => ({}));
    const parsed = LogCallSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const sb = supabaseAdmin();
    const { data: prospect } = await sb
      .from('prospects')
      .select('owner_id, attempts')
      .eq('id', id)
      .maybeSingle();
    if (!prospect) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const ownerId = (prospect as { owner_id: string | null }).owner_id;
    if (session.role === 'setter' && ownerId !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const { error: callErr } = await sb.from('prospect_calls').insert({
      prospect_id: id,
      setter_id: session.userId,
      disposition: parsed.data.disposition,
      spoke_with_dm: parsed.data.spoke_with_dm ?? false,
      note: parsed.data.note ?? null,
      called_at: nowIso,
    });
    if (callErr) {
      return Response.json({ error: callErr.message }, { status: 500 });
    }

    const attempts = ((prospect as { attempts: number }).attempts ?? 0) + 1;

    // Auto-retire: N dials with nobody picking up and the prospect drops out
    // of the working queue. The call row still records what actually happened
    // ('no_answer'); only the prospect's standing changes.
    let status: string = parsed.data.disposition;
    let retired = false;
    if (parsed.data.disposition === 'no_answer') {
      const { autoRetireAfter } = await getOutreachSettings();
      if (autoRetireAfter > 0 && attempts >= autoRetireAfter) {
        status = 'unreachable';
        retired = true;
      }
    }

    const update: Record<string, unknown> = {
      status,
      attempts,
      last_contacted_at: nowIso,
    };
    if ('next_action' in parsed.data) update.next_action = parsed.data.next_action ?? null;
    if ('next_action_at' in parsed.data) update.next_action_at = parsed.data.next_action_at ?? null;

    const { error: updErr } = await sb.from('prospects').update(update).eq('id', id);
    if (updErr) {
      return Response.json({ error: updErr.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'prospect',
      entity_id: id,
      diff: { disposition: parsed.data.disposition, ...(retired ? { auto_retired: true } : {}) },
    });

    // A booked prospect is qualified — promote it into the real pipeline
    // (creates a contact + deal, notifies the owner). Idempotent + best-effort.
    let convertedContactId: string | null = null;
    if (parsed.data.disposition === 'booked') {
      convertedContactId = await promoteProspectToLead(id, session.userId);
    }

    return Response.json({
      ok: true,
      converted_contact_id: convertedContactId,
      retired,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/prospects/[id]/log POST', err);
  }
}
