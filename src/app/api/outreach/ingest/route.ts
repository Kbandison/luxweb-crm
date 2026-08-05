import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { IngestSchema, type IngestLead } from '@/lib/validation/ingest';
import { loadProspectIndex } from '@/lib/outreach/dedupe';
import { getOwnerUserId } from '@/lib/queries/outreach';
import { hasCapability, type Role } from '@/lib/auth/permissions';
import { requireIngestKey } from '@/lib/outreach/ingest-auth';

export const runtime = 'nodejs';

/**
 * POST /api/outreach/ingest — machine-to-machine lead push from the
 * lead-finding tool (ByteBoundless), so a business found there lands on a
 * setter's call list without a CSV round trip.
 *
 * Authenticated by a shared key rather than a session: the caller is another
 * one of the studio's apps, not a browser. Leads run through the same
 * duplicate check as the CSV importer, so a business already being called
 * won't be handed to a second setter.
 */

/** Who ends up owning these leads. */
async function resolveOwner(
  assignTo: string | null | undefined,
): Promise<{ userId: string; email: string | null } | { error: string }> {
  if (!assignTo) {
    const ownerId = await getOwnerUserId();
    return ownerId
      ? { userId: ownerId, email: null }
      : { error: 'No studio owner to assign to.' };
  }
  const { data } = await supabaseAdmin()
    .from('users')
    .select('id, email, role')
    .ilike('email', assignTo)
    .maybeSingle();
  const user = data as { id: string; email: string; role: Role } | null;
  if (!user) return { error: `No CRM user with the email ${assignTo}.` };
  if (!hasCapability(user.role, 'manage_outreach')) {
    return { error: `${assignTo} isn't on the outreach team.` };
  }
  return { userId: user.id, email: user.email };
}

/** Fields that only exist once crm_prospects_external.sql has been applied. */
const EXTERNAL_FIELDS = ['website', 'external_source', 'external_id'] as const;

function buildRow(
  lead: IngestLead,
  ownerId: string,
  source: string,
  withExternal: boolean,
): Record<string, unknown> {
  // The tool finds businesses, not people — fall back to the business name so
  // the setter at least knows who they're calling about.
  const base: Record<string, unknown> = {
    owner_id: ownerId,
    full_name: lead.contact_name?.trim() || lead.business_name,
    company: lead.business_name,
    phone: lead.phone ?? null,
    email: lead.email ?? null,
    industry: lead.industry ?? null,
    website_problem: lead.angle ?? null,
    source,
    notes: lead.notes ?? null,
  };
  if (withExternal) {
    base.website = lead.website ?? null;
    base.external_source = source;
    base.external_id = lead.external_id ?? null;
  } else if (lead.website) {
    // Migration not applied yet — keep the URL rather than dropping it.
    base.notes = [lead.notes, lead.website].filter(Boolean).join('\n');
  }
  return base;
}

export async function POST(req: Request) {
  try {
    const denied = requireIngestKey(req);
    if (denied) return denied;

    const limit = limitByKey('outreach/ingest', { capacity: 30, refillPerSec: 30 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const raw = await req.json().catch(() => ({}));
    const parsed = IngestSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { source, leads } = parsed.data;

    const owner = await resolveOwner(parsed.data.assign_to);
    if ('error' in owner) {
      return Response.json({ error: owner.error }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const index = await loadProspectIndex(owner.userId);

    // Anything already pushed from this tool, so a re-send is a no-op even for
    // a business with no phone number to match on.
    const externalIds = leads
      .map((l) => l.external_id)
      .filter((v): v is string => !!v);
    const alreadySent = new Set<string>();
    if (externalIds.length > 0) {
      const { data } = await sb
        .from('prospects')
        .select('external_id')
        .eq('external_source', source)
        .in('external_id', externalIds);
      for (const r of (data ?? []) as { external_id: string | null }[]) {
        if (r.external_id) alreadySent.add(r.external_id);
      }
    }

    let skipped = 0;
    const conflicts: Array<{ business: string; heldBy: string | null }> = [];
    const accepted: IngestLead[] = [];
    for (const lead of leads) {
      if (lead.external_id && alreadySent.has(lead.external_id)) {
        skipped += 1;
        continue;
      }
      const clash = index.find(lead.phone, lead.email);
      if (clash) {
        skipped += 1;
        conflicts.push({
          business: lead.business_name,
          heldBy: clash.kind === 'contact' ? 'pipeline' : clash.ownerName,
        });
        continue;
      }
      index.reserve(lead.phone, lead.email);
      if (lead.external_id) alreadySent.add(lead.external_id);
      accepted.push(lead);
    }

    let imported = 0;
    if (accepted.length > 0) {
      const rows = accepted.map((l) => buildRow(l, owner.userId, source, true));
      let { error, count } = await sb
        .from('prospects')
        .insert(rows, { count: 'exact' });
      // Fall back for a CRM that hasn't run crm_prospects_external.sql yet —
      // the leads still land, just without the website/external ref columns.
      if (error && EXTERNAL_FIELDS.some((f) => error!.message.includes(f))) {
        ({ error, count } = await sb
          .from('prospects')
          .insert(
            accepted.map((l) => buildRow(l, owner.userId, source, false)),
            { count: 'exact' },
          ));
      }
      if (error) return Response.json({ error: error.message }, { status: 500 });
      imported = count ?? accepted.length;
    }

    await writeAudit({
      actor_id: owner.userId,
      action: 'create',
      entity_type: 'prospect_ingest',
      diff: { source, imported, skipped },
    });

    return Response.json({
      imported,
      skipped,
      // So the sender can confirm whose list these landed on.
      assigned_to: owner.email,
      conflicts: conflicts.slice(0, 20),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/ingest', err);
  }
}
