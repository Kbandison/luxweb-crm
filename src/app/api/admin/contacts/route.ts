import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

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
    const raw = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin()
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

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'contact',
      entity_id: data.id as string,
    });

    return Response.json({ id: data.id });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
