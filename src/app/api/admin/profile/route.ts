import { z } from 'zod';
import { requireBackOffice } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { ADMIN_EMAIL_PREFS, pickEmailPrefs } from '@/lib/email-prefs';

export const runtime = 'nodejs';

// Toggles are stored only for keys the settings catalogue renders
// (src/lib/email-prefs.ts); anything else in the payload is dropped.
const EmailPrefsSchema = z
  .record(z.string().max(64), z.boolean())
  .refine((o) => Object.keys(o).length <= 100)
  .transform((o) => pickEmailPrefs(o, ADMIN_EMAIL_PREFS));

const UpdateSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  email_prefs: EmailPrefsSchema.optional(),
});

export async function PATCH(req: Request) {
  try {
    const session = await requireBackOffice();
    const limit = limitByKey(`admin/profile:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
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
      // Compare whitespace-insensitively: a stored name with a stray space
      // must not read as a rename (and 409) when the form sends it trimmed.
      const tidy = (s: string | null) => s?.trim().replace(/\s+/g, ' ') ?? null;
      const currentName = tidy((currentUser?.full_name as string | null) ?? null);
      const nextName = tidy(parsed.data.full_name);

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
