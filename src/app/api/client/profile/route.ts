import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const UpdateSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  email_prefs: z.record(z.string(), z.boolean()).optional(),
});

export async function PATCH(req: Request) {
  try {
    const session = await requireClient();
    const limit = limitByKey(`client/profile:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const raw = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(raw);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const sb = supabaseAdmin();

    // If the client is trying to change full_name, lock it once they've
    // signed anything. namesMatch() in the signing flow trusts the
    // on-file full_name — a self-edit there would let someone forge a
    // future signature. Admin contact endpoints can still override.
    if (typeof parsed.data.full_name === 'string') {
      const { data: currentUser } = await sb
        .from('users')
        .select('full_name')
        .eq('id', session.userId)
        .single();
      const currentName = (currentUser?.full_name as string | null) ?? null;
      const nextName = parsed.data.full_name;

      // No-op rename: accept silently so the UI doesn't see spurious 409s.
      if (currentName !== nextName) {
        // Any accepted proposal on a contact tied to this user?
        const { data: contactRows } = await sb
          .from('contacts')
          .select('id')
          .eq('user_id', session.userId);
        const contactIds = (contactRows ?? []).map((r) => r.id as string);

        let locked = false;
        if (contactIds.length > 0) {
          const { data: acceptedProposal } = await sb
            .from('proposals')
            .select('id')
            .in('contact_id', contactIds)
            .not('accepted_at', 'is', null)
            .limit(1)
            .maybeSingle();
          if (acceptedProposal) locked = true;

          if (!locked) {
            const { data: clientSigned } = await sb
              .from('contracts')
              .select('id')
              .in('contact_id', contactIds)
              .not('signed_at', 'is', null)
              .limit(1)
              .maybeSingle();
            if (clientSigned) locked = true;
          }
          if (!locked) {
            const { data: adminSigned } = await sb
              .from('contracts')
              .select('id')
              .in('contact_id', contactIds)
              .not('admin_signed_at', 'is', null)
              .limit(1)
              .maybeSingle();
            if (adminSigned) locked = true;
          }
        }

        if (locked) {
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
