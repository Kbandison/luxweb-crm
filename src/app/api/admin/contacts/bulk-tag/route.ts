import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const BodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  tag: z.string().trim().min(1).max(40),
});

export async function POST(req: Request) {
  try {
    const session = await requireAdmin();

    // 10 batches / 60s per admin. A single batch may touch up to 500 rows.
    const limit = limitByKey(`bulk-tag:admin:${session.userId}`, {
      capacity: 10,
      refillPerSec: 10 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const tag = parsed.data.tag;
    const ids = Array.from(new Set(parsed.data.ids));

    const sb = supabaseAdmin();
    const { data: existing } = await sb
      .from('contacts')
      .select('id, tags')
      .in('id', ids);

    type Row = { id: string; tags: string[] | null };
    const rows = (existing ?? []) as Row[];

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Per-row update wrapped in try/catch — one bad row mustn't kill the
    // whole batch. We could parallelize with Promise.all, but admin batches
    // are bounded (≤500) and the predictable sequential ordering helps when
    // debugging from audit logs.
    for (const row of rows) {
      try {
        const current = Array.isArray(row.tags) ? row.tags : [];
        if (current.includes(tag)) {
          skipped += 1;
          continue;
        }
        const next = [...current, tag];
        const { error } = await sb
          .from('contacts')
          .update({ tags: next })
          .eq('id', row.id);
        if (error) {
          errors.push(row.id);
          continue;
        }
        updated += 1;
      } catch {
        errors.push(row.id);
      }
    }

    const missing = ids.length - rows.length;

    await writeAudit({
      actor_id: session.userId,
      action: 'bulk_tag',
      entity_type: 'contact',
      diff: {
        tag,
        requested: ids.length,
        updated,
        skipped,
        missing,
        errors: errors.length,
      },
    });

    // Bust the lists both surfaces use so a router.refresh() on the client
    // pulls fresh tags.
    revalidatePath('/admin/clients');
    revalidatePath('/admin/leads');

    return Response.json({
      ok: true,
      tag,
      requested: ids.length,
      updated,
      skipped,
      missing,
      errors: errors.length,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
