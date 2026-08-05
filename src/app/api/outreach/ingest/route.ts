import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { IngestSchema, type IngestLead } from '@/lib/validation/ingest';
import { loadProspectIndex, type ProspectMatch } from '@/lib/outreach/dedupe';
import { getOwnerUserId } from '@/lib/queries/outreach';
import { hasCapability, type Role } from '@/lib/auth/permissions';
import { requireIngestKey } from '@/lib/outreach/ingest-auth';
import {
  degradeStatus,
  isWorkedStatus,
  mapExternalStatus,
} from '@/lib/outreach/external-status';

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

/** ISO timestamp, or null if the sender gave us something unparseable. */
function parseWhen(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function buildRow(
  lead: IngestLead,
  ownerId: string,
  source: string,
  withExternal: boolean,
  /** Degrade statuses the database's enum may not have yet. */
  safeStatus: boolean,
): Record<string, unknown> {
  const mapped = mapExternalStatus(lead.status);
  const status = safeStatus ? degradeStatus(mapped) : mapped;
  const contactedAt = parseWhen(lead.contacted_at);
  const worked = isWorkedStatus(mapped);

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
    status,
    // Worked leads arrive with an attempt on the board so the card doesn't
    // read as untouched.
    attempts: worked ? 1 : 0,
    last_contacted_at: worked ? contactedAt : null,
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

/**
 * Give already-worked leads a history entry, so the card shows *when* they
 * were contacted and what was said instead of just a status badge.
 *
 * `called_at` is the original outreach date, not now — otherwise a batch of
 * old activity would land in this week's scorecard and inflate it. Rows are
 * zipped to the insert result by position (PostgREST returns them in input
 * order); best-effort, since a missing timeline shouldn't fail a push.
 */
async function recordExternalHistory(
  leads: IngestLead[],
  prospectIds: string[],
  setterId: string,
  source: string,
  safeStatus: boolean,
): Promise<void> {
  if (prospectIds.length !== leads.length) return; // can't zip safely
  const rows = leads
    .map((lead, i) => {
      const mapped = mapExternalStatus(lead.status);
      const when = parseWhen(lead.contacted_at);
      if (!isWorkedStatus(mapped) || !when) return null;
      return {
        prospect_id: prospectIds[i],
        setter_id: setterId,
        disposition: safeStatus ? degradeStatus(mapped) : mapped,
        spoke_with_dm: false,
        note: [`Imported from ${source}`, lead.notes].filter(Boolean).join(' · '),
        called_at: when,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return;
  try {
    await supabaseAdmin().from('prospect_calls').insert(rows);
  } catch {
    /* the prospects still landed — the timeline is a bonus */
  }
}

/**
 * Whether an existing prospect should take the sender's outcome.
 *
 * Only when the CRM row is genuinely untouched — status still 'new' with no
 * logged dials. The CRM is the system of record for calls, so anything a
 * setter has actually done here outranks whatever the other tool believes.
 * That means a re-push can fill in a blank but can never walk back real work.
 */
function backfillable(clash: ProspectMatch, lead: IngestLead): boolean {
  if (clash.kind !== 'prospect' || !clash.id) return false;
  if (clash.status !== 'new' || clash.attempts > 0) return false;
  return mapExternalStatus(lead.status) !== 'new';
}

/** Apply the outcomes collected above. Returns how many rows changed. */
async function applyBackfills(
  backfills: Array<{ prospectId: string; lead: IngestLead }>,
  setterId: string,
  source: string,
): Promise<number> {
  if (backfills.length === 0) return 0;
  const sb = supabaseAdmin();
  let updated = 0;

  for (const { prospectId, lead } of backfills) {
    const mapped = mapExternalStatus(lead.status);
    const when = parseWhen(lead.contacted_at);
    const worked = isWorkedStatus(mapped);
    const patch: Record<string, unknown> = { status: mapped };
    if (worked) {
      patch.attempts = 1;
      patch.last_contacted_at = when;
    }
    let { error } = await sb.from('prospects').update(patch).eq('id', prospectId);
    if (error?.message.includes('invalid input value for enum')) {
      ({ error } = await sb
        .from('prospects')
        .update({ ...patch, status: degradeStatus(mapped) })
        .eq('id', prospectId));
    }
    if (error) continue; // one bad row shouldn't sink the batch
    updated += 1;
  }

  // Same history treatment a fresh import gets.
  await recordExternalHistory(
    backfills.map((b) => b.lead),
    backfills.map((b) => b.prospectId),
    setterId,
    source,
    false,
  );
  return updated;
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
    // a business with no phone number to match on. Carries status/attempts so
    // an untouched row can still take a newer outcome (see backfillable).
    const externalIds = leads
      .map((l) => l.external_id)
      .filter((v): v is string => !!v);
    const alreadySent = new Map<string, ProspectMatch>();
    if (externalIds.length > 0) {
      const { data } = await sb
        .from('prospects')
        .select('id, external_id, status, attempts')
        .eq('external_source', source)
        .in('external_id', externalIds);
      for (const r of (data ?? []) as {
        id: string;
        external_id: string | null;
        status: ProspectMatch['status'];
        attempts: number | null;
      }[]) {
        if (!r.external_id) continue;
        alreadySent.set(r.external_id, {
          kind: 'prospect',
          id: r.id,
          fullName: '',
          company: null,
          phone: null,
          email: null,
          status: r.status,
          attempts: r.attempts ?? 0,
          lastContactedAt: null,
          ownerId: null,
          ownerName: null,
          mine: true,
        });
      }
    }

    let skipped = 0;
    const conflicts: Array<{ business: string; heldBy: string | null }> = [];
    const accepted: IngestLead[] = [];
    const backfills: Array<{ prospectId: string; lead: IngestLead }> = [];
    for (const lead of leads) {
      const seen = lead.external_id ? alreadySent.get(lead.external_id) : undefined;
      if (seen) {
        if (backfillable(seen, lead)) backfills.push({ prospectId: seen.id, lead });
        skipped += 1;
        continue;
      }
      const clash = index.find(lead.phone, lead.email);
      if (clash) {
        // Already here. If the CRM row is untouched and the sender knows more
        // about it than we do, backfill rather than silently dropping the
        // outcome — the usual case is a lead pushed cold earlier that has
        // since been worked in the other tool.
        if (backfillable(clash, lead)) {
          backfills.push({ prospectId: clash.id, lead });
        } else {
          conflicts.push({
            business: lead.business_name,
            heldBy: clash.kind === 'contact' ? 'pipeline' : clash.ownerName,
          });
        }
        skipped += 1;
        continue;
      }
      index.reserve(lead.phone, lead.email);
      // Mark it claimed so a duplicate row inside this same batch is skipped.
      if (lead.external_id) {
        alreadySent.set(lead.external_id, {
          kind: 'prospect',
          id: '',
          fullName: '',
          company: null,
          phone: null,
          email: null,
          status: null,
          attempts: 0,
          lastContactedAt: null,
          ownerId: null,
          ownerName: null,
          mine: true,
        });
      }
      accepted.push(lead);
    }

    let imported = 0;
    if (accepted.length > 0) {
      // Two independent things the database may be too old for: the external
      // ref columns, and the 'contacted' status value. Retry once per problem
      // rather than failing the whole push.
      let withExternal = true;
      let safeStatus = false;
      const attemptInsert = () =>
        sb
          .from('prospects')
          .insert(
            accepted.map((l) =>
              buildRow(l, owner.userId, source, withExternal, safeStatus),
            ),
            { count: 'exact' },
          )
          .select('id');

      let { data: inserted, error, count } = await attemptInsert();
      if (error && EXTERNAL_FIELDS.some((f) => error!.message.includes(f))) {
        withExternal = false;
        ({ data: inserted, error, count } = await attemptInsert());
      }
      // crm_prospect_contacted.sql not applied — land them as 'new'.
      if (error && error.message.includes('invalid input value for enum')) {
        safeStatus = true;
        ({ data: inserted, error, count } = await attemptInsert());
      }
      if (error) return Response.json({ error: error.message }, { status: 500 });
      imported = count ?? accepted.length;

      await recordExternalHistory(
        accepted,
        ((inserted ?? []) as { id: string }[]).map((r) => r.id),
        owner.userId,
        source,
        safeStatus,
      );
    }

    const updated = await applyBackfills(backfills, owner.userId, source);

    await writeAudit({
      actor_id: owner.userId,
      action: 'create',
      entity_type: 'prospect_ingest',
      diff: { source, imported, skipped, updated },
    });

    return Response.json({
      imported,
      skipped,
      updated,
      // So the sender can confirm whose list these landed on.
      assigned_to: owner.email,
      conflicts: conflicts.slice(0, 20),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/ingest', err);
  }
}
