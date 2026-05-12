import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const ENTITY_TYPES = ['contact', 'deal', 'project'] as const;

const CreateSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid(),
  body: z.string().min(1).max(8000),
  is_private: z.boolean().default(true),
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
      .from('notes')
      .insert({
        entity_type: parsed.data.entity_type,
        entity_id: parsed.data.entity_id,
        body: parsed.data.body,
        is_private: parsed.data.is_private,
        author_id: session.userId,
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
      entity_type: 'note',
      entity_id: data.id as string,
      diff: {
        on: { type: parsed.data.entity_type, id: parsed.data.entity_id },
        is_private: parsed.data.is_private,
      },
    });

    return Response.json({ id: data.id });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
