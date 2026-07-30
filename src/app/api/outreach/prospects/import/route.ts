import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { loadProspectIndex } from '@/lib/outreach/dedupe';

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

/**
 * POST /api/outreach/prospects/import — bulk-add prospects from a parsed CSV.
 * Rows are deduped (by phone or email) against EVERY setter's call list and the
 * real contacts table, so a sheet import won't re-add someone already in the
 * pipeline or hand a second setter a business the first one is already
 * dialing. The importer owns the new prospects.
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

    const index = await loadProspectIndex(session.userId);

    let skipped = 0;
    let skippedOther = 0; // held by a different setter — worth naming in the UI
    const heldBy = new Set<string>();
    const toInsert: Record<string, unknown>[] = [];
    for (const row of parsed.data.rows) {
      const clash = index.find(row.phone, row.email);
      if (clash) {
        skipped += 1;
        if (clash.kind === 'prospect' && !clash.mine) {
          skippedOther += 1;
          if (clash.ownerName) heldBy.add(clash.ownerName);
        }
        continue;
      }
      // Claim the keys so one CSV can't duplicate itself.
      index.reserve(row.phone, row.email);
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
      const { error, count } = await supabaseAdmin()
        .from('prospects')
        .insert(toInsert, { count: 'exact' });
      if (error) return Response.json({ error: error.message }, { status: 500 });
      imported = count ?? toInsert.length;
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'prospect_import',
      diff: { imported, skipped, skippedOther },
    });

    return Response.json({
      imported,
      skipped,
      skippedOther,
      heldBy: [...heldBy].slice(0, 4),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/prospects/import', err);
  }
}
