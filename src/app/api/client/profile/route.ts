import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const UpdateSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  email_prefs: z.record(z.string(), z.boolean()).optional(),
});

export async function PATCH(req: Request) {
  try {
    const session = await requireClient();
    const raw = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(raw);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const { error } = await sb
      .from('users')
      .update(parsed.data)
      .eq('id', session.userId);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Mirror full_name onto every contact row pointing at this user, so
    // signature validation and any other contact-name-driven UI stays in
    // sync with the user's self-edit.
    if (typeof parsed.data.full_name === 'string') {
      try {
        await sb
          .from('contacts')
          .update({ full_name: parsed.data.full_name })
          .eq('user_id', session.userId);
      } catch {
        // Best-effort; user-level update already succeeded.
      }
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'user',
      entity_id: session.userId,
      diff: { fields: Object.keys(parsed.data) },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
