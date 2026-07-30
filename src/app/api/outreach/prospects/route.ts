import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { CreateProspectSchema } from '@/lib/validation/outreach';
import { findProspectConflict } from '@/lib/outreach/dedupe';

export const runtime = 'nodejs';

/**
 * POST /api/outreach/prospects — add a prospect to the call list. Requires
 * `manage_outreach` (setter/owner/manager). The creator owns it, so a setter's
 * prospects stay on their list and the owner sees everyone's.
 *
 * The phone/email is checked against the whole list (every setter, plus real
 * contacts) so two setters don't dial the same business. A collision returns
 * 409 with who holds it; `allow_duplicate: true` overrides — a wrong number or
 * a second contact at the same business is a legitimate re-add.
 */
export async function POST(req: Request) {
  try {
    const session = await requireCapability('manage_outreach');
    const limit = limitByKey(`outreach/prospects:${session.userId}`, {
      capacity: 120,
      refillPerSec: 120 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const raw = await req.json().catch(() => ({}));
    const parsed = CreateProspectSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    if (raw?.allow_duplicate !== true) {
      const clash = await findProspectConflict(
        parsed.data.phone,
        parsed.data.email,
        session.userId,
      );
      if (clash) {
        const where =
          clash.kind === 'contact'
            ? 'already a lead in the pipeline'
            : clash.mine
              ? 'already on your call list'
              : `already on ${clash.ownerName ?? 'another setter'}'s call list`;
        return Response.json(
          {
            error: `${clash.company ?? clash.fullName} is ${where}.`,
            conflict: {
              kind: clash.kind,
              company: clash.company,
              fullName: clash.fullName,
              status: clash.status,
              attempts: clash.attempts,
              lastContactedAt: clash.lastContactedAt,
              ownerName: clash.ownerName,
              mine: clash.mine,
            },
          },
          { status: 409 },
        );
      }
    }

    const { data, error } = await supabaseAdmin()
      .from('prospects')
      .insert({
        owner_id: session.userId,
        full_name: parsed.data.full_name,
        company: parsed.data.company ?? null,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        industry: parsed.data.industry ?? null,
        website_problem: parsed.data.website_problem ?? null,
        source: parsed.data.source ?? null,
        notes: parsed.data.notes ?? null,
        next_action: parsed.data.next_action ?? null,
        next_action_at: parsed.data.next_action_at ?? null,
      })
      .select('id')
      .single();
    if (error || !data) {
      return Response.json(
        { error: error?.message ?? 'Insert failed' },
        { status: 500 },
      );
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'prospect',
      entity_id: (data as { id: string }).id,
    });

    return Response.json({ id: (data as { id: string }).id });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/prospects POST', err);
  }
}
