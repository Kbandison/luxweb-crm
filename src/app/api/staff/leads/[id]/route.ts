import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const UpdateSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  source: z.string().max(80).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  lead_score: z.number().int().min(0).max(100).optional(),
});

/** Confirm the caller owns this lead; returns false (→ 404) otherwise. */
async function ownsLead(contactId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from('contacts')
    .select('owner_id')
    .eq('id', contactId)
    .maybeSingle();
  return (data as { owner_id: string | null } | null)?.owner_id === userId;
}

/** PATCH /api/staff/leads/[id] — edit a lead the contractor owns. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_own_leads');
    const limit = limitByKey(`staff/leads/[id]:${session.userId}`, {
      capacity: 60,
      refillPerSec: 60 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    if (!(await ownsLead(id, session.userId))) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const patch: Record<string, unknown> = {};
    for (const key of [
      'full_name',
      'email',
      'phone',
      'company',
      'source',
      'tags',
      'lead_score',
    ] as const) {
      if (key in parsed.data) patch[key] = parsed.data[key] ?? null;
    }
    if (Object.keys(patch).length === 0) return Response.json({ ok: true });

    const { error } = await supabaseAdmin()
      .from('contacts')
      .update(patch)
      .eq('id', id);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'contact',
      entity_id: id,
      diff: patch,
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('staff/leads/[id] PATCH', err);
  }
}

/** DELETE /api/staff/leads/[id] — remove a lead the contractor owns. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_own_leads');
    const limit = limitByKey(`staff/leads/[id]:${session.userId}`, {
      capacity: 60,
      refillPerSec: 60 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    if (!(await ownsLead(id, session.userId))) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const { error } = await supabaseAdmin().from('contacts').delete().eq('id', id);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'contact',
      entity_id: id,
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('staff/leads/[id] DELETE', err);
  }
}
