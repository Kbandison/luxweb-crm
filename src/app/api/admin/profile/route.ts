import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const UpdateSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  email_prefs: z.record(z.string(), z.boolean()).optional(),
});

export async function PATCH(req: Request) {
  try {
    const session = await requireAdmin();
    const raw = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(raw);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const sb = supabaseAdmin();

    // If the admin is trying to change full_name, lock it once they've
    // counter-signed a contract. The signing flow burns the admin's
    // current full_name into the contract metadata; letting them rename
    // post-signing would let them forge a signature retroactively.
    if (typeof parsed.data.full_name === 'string') {
      const { data: currentUser } = await sb
        .from('users')
        .select('full_name')
        .eq('id', session.userId)
        .single();
      const currentName = (currentUser?.full_name as string | null) ?? null;
      const nextName = parsed.data.full_name;

      // No-op rename: accept silently.
      if (currentName !== nextName) {
        const { data: signedContract } = await sb
          .from('contracts')
          .select('id')
          .not('admin_signed_at', 'is', null)
          .limit(1)
          .maybeSingle();
        if (signedContract) {
          return Response.json(
            {
              error:
                "Your name is locked because you've signed documents. Contact us if it needs to change.",
            },
            { status: 409 },
          );
        }
      }
    }

    const { error } = await sb
      .from('users')
      .update(parsed.data)
      .eq('id', session.userId);

    if (error) return Response.json({ error: error.message }, { status: 500 });

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
