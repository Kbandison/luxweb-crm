import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const MAX_ROWS = 2000;

const RowSchema = z.object({
  full_name: z.string().min(1).max(200),
  company: z.string().max(200).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  industry: z.string().max(120).optional().nullable(),
  website_problem: z.string().max(1000).optional().nullable(),
  source: z.string().max(120).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

const Schema = z.object({ rows: z.array(RowSchema).max(MAX_ROWS) });

const normPhone = (v?: string | null) => (v ?? '').replace(/[^\d]/g, '');
const normEmail = (v?: string | null) => (v ?? '').trim().toLowerCase();

/**
 * POST /api/outreach/prospects/import — bulk-add prospects from a parsed CSV.
 * Rows are deduped (by phone or email) against the importer's existing
 * prospects AND the real contacts table, so a sheet import won't re-add
 * someone already in the pipeline. The importer owns the new prospects.
 */
export async function POST(req: Request) {
  try {
    const session = await requireCapability('manage_outreach');
    const limit = limitByKey(`outreach/import:${session.userId}`, {
      capacity: 10,
      refillPerSec: 10 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const sb = supabaseAdmin();
    // Build dedupe sets from existing prospects (this owner) + all contacts.
    const [{ data: existingP }, { data: contacts }] = await Promise.all([
      sb.from('prospects').select('phone, email').eq('owner_id', session.userId),
      sb.from('contacts').select('phone, email'),
    ]);
    const seenPhone = new Set<string>();
    const seenEmail = new Set<string>();
    for (const r of [
      ...((existingP ?? []) as { phone: string | null; email: string | null }[]),
      ...((contacts ?? []) as { phone: string | null; email: string | null }[]),
    ]) {
      const p = normPhone(r.phone);
      const e = normEmail(r.email);
      if (p) seenPhone.add(p);
      if (e) seenEmail.add(e);
    }

    let skipped = 0;
    const toInsert: Record<string, unknown>[] = [];
    for (const row of parsed.data.rows) {
      const p = normPhone(row.phone);
      const e = normEmail(row.email);
      if ((p && seenPhone.has(p)) || (e && seenEmail.has(e))) {
        skipped += 1;
        continue;
      }
      // Also dedupe within this batch.
      if (p) seenPhone.add(p);
      if (e) seenEmail.add(e);
      toInsert.push({
        owner_id: session.userId,
        full_name: row.full_name,
        company: row.company ?? null,
        phone: row.phone ?? null,
        email: row.email ?? null,
        industry: row.industry ?? null,
        website_problem: row.website_problem ?? null,
        source: row.source ?? 'import',
        notes: row.notes ?? null,
      });
    }

    let imported = 0;
    if (toInsert.length > 0) {
      const { error, count } = await sb
        .from('prospects')
        .insert(toInsert, { count: 'exact' });
      if (error) return Response.json({ error: error.message }, { status: 500 });
      imported = count ?? toInsert.length;
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'prospect_import',
      diff: { imported, skipped },
    });

    return Response.json({ imported, skipped });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/prospects/import', err);
  }
}
