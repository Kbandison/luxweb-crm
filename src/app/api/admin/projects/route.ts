import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const STATUSES = [
  'planning',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
] as const;

const CreateSchema = z.object({
  contact_id: z.string().uuid(),
  deal_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(200),
  status: z.enum(STATUSES).default('planning'),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  budget_cents: z.number().int().min(0).optional().nullable(),
  profitability_cents: z.number().int().optional().nullable(),
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
      .from('projects')
      .insert({
        contact_id: parsed.data.contact_id,
        deal_id: parsed.data.deal_id ?? null,
        name: parsed.data.name,
        status: parsed.data.status,
        start_date: parsed.data.start_date ?? null,
        end_date: parsed.data.end_date ?? null,
        budget_cents: parsed.data.budget_cents ?? null,
        profitability_cents: parsed.data.profitability_cents ?? null,
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
      entity_type: 'project',
      entity_id: data.id as string,
    });

    return Response.json({ id: data.id });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
