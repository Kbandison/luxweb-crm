import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const CreateSchema = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  source: z.string().max(80).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  lead_score: z.number().int().min(0).max(100).optional(),
});

/**
 * POST /api/staff/leads — a contractor creates a lead they own. Mirrors
 * /api/admin/contacts but requires only `manage_own_leads` and stamps
 * owner_id = the caller so they (and the owner) see it; the owner's pipeline
 * gets a matching deal.
 */
export async function POST(req: Request) {
  try {
    const session = await requireCapability('manage_own_leads');
    const limit = limitByKey(`staff/leads:${session.userId}`, {
      capacity: 60,
      refillPerSec: 60 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const raw = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('contacts')
      .insert({
        full_name: parsed.data.full_name,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        company: parsed.data.company ?? null,
        source: parsed.data.source ?? null,
        tags: parsed.data.tags ?? [],
        lead_score: parsed.data.lead_score ?? 0,
        owner_id: session.userId,
      })
      .select('id')
      .single();
    if (error || !data) {
      return Response.json(
        { error: error?.message ?? 'Insert failed' },
        { status: 500 },
      );
    }

    const contactId = (data as { id: string }).id;
    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'contact',
      entity_id: contactId,
      diff: { source: 'staff' },
    });

    // Mirror the admin flow: drop a placeholder deal so it lands on the
    // pipeline for the owner, owned by this contractor.
    const dealTitle = `${parsed.data.company ?? parsed.data.full_name} — new inquiry`;
    await sb
      .from('deals')
      .insert({ contact_id: contactId, title: dealTitle, owner_id: session.userId });

    return Response.json({ id: contactId });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('staff/leads POST', err);
  }
}
