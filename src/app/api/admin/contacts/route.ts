import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
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

export async function POST(req: Request) {
  try {
    const session = await requireAdmin();
    const limit = limitByKey(`admin/contacts:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
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
      })
      .select()
      .single();

    if (error || !data) {
      return Response.json(
        { error: error?.message ?? 'Insert failed' },
        { status: 500 },
      );
    }

    const contactId = data.id as string;

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'contact',
      entity_id: contactId,
    });

    // Drop a placeholder deal in 'lead' stage so the contact lands on the
    // pipeline kanban immediately. Admin updates title/value/stage as the
    // conversation matures.
    const fullName = parsed.data.full_name;
    const company = parsed.data.company ?? null;
    const dealTitle = `${company ?? fullName} — new inquiry`;
    const { data: deal } = await sb
      .from('deals')
      .insert({ contact_id: contactId, title: dealTitle })
      .select('id')
      .single();
    if (deal) {
      await writeAudit({
        actor_id: session.userId,
        action: 'create',
        entity_type: 'deal',
        entity_id: (deal as { id: string }).id,
        diff: { contact_id: contactId, source: 'manual' },
      });
    }

    return Response.json({ id: contactId });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
