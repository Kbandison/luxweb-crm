import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { recordReviewOnContact } from '@/lib/google-reviews/record';

export const runtime = 'nodejs';

const Schema = z
  .object({
    /** true / false pins it; null hands it back to the default rule. */
    show_on_site: z.boolean().nullable().optional(),
    contact_id: z.string().uuid().nullable().optional(),
  })
  .refine((d) => d.show_on_site !== undefined || d.contact_id !== undefined, {
    message: 'Nothing to change',
  });

/**
 * PATCH — Kevin's two controls on a Google review: whether it shows on the
 * site, and which client wrote it. Linking a client puts the review on their
 * contact, the same note the assistant adds when it matches one itself.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_reviews');
    const limit = limitByKey(`admin/google-reviews/[id]:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const sb = supabaseAdmin();
    const { data: review } = await sb
      .from('google_reviews')
      .select('id, rating, body, reviewed_at, contact_id')
      .eq('id', id)
      .maybeSingle();
    if (!review) return Response.json({ error: 'Not found' }, { status: 404 });
    const current = review as {
      id: string;
      rating: number;
      body: string | null;
      reviewed_at: string;
      contact_id: string | null;
    };

    if (d.contact_id) {
      const { data: contact } = await sb.from('contacts').select('id').eq('id', d.contact_id).maybeSingle();
      if (!contact) return Response.json({ error: 'Client not found' }, { status: 404 });
    }

    const patch: Record<string, unknown> = {};
    if (d.show_on_site !== undefined) patch.show_on_site = d.show_on_site;
    if (d.contact_id !== undefined) patch.contact_id = d.contact_id;

    const { error } = await sb.from('google_reviews').update(patch).eq('id', id);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'google_review',
      entity_id: id,
      diff: patch,
    });
    if (d.contact_id && d.contact_id !== current.contact_id) {
      await recordReviewOnContact(d.contact_id, current, session.userId, { via: 'admin' });
    }

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/google-reviews/[id] PATCH', err);
  }
}
