import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const STAGES = [
  'lead',
  'discovery',
  'proposal',
  'active',
  'completed',
  'retainer',
] as const;

const CreateSchema = z.object({
  contact_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  stage: z.enum(STAGES).default('lead'),
  value_cents: z.number().int().min(0).default(0),
  probability: z.number().int().min(0).max(100).default(0),
  expected_close: z.string().optional().nullable(),
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
      .from('deals')
      .insert({
        contact_id: parsed.data.contact_id,
        title: parsed.data.title,
        stage: parsed.data.stage,
        value_cents: parsed.data.value_cents,
        probability: parsed.data.probability,
        expected_close: parsed.data.expected_close ?? null,
        owner_id: session.userId,
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
      entity_type: 'deal',
      entity_id: data.id as string,
    });

    return Response.json({ id: data.id });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
