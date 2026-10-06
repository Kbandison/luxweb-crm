import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { withdrawUnsigned } from '@/lib/contracts/after-sign';

export const runtime = 'nodejs';

const UpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  total_cents: z.number().int().min(0).nullable().optional(),
  expires_at: z.string().nullable().optional(),
  // content_json accepts any object — validated loosely so the editor can
  // evolve without server-side coupling. Admin-only mutation anyway.
  content_json: z.record(z.string(), z.unknown()).optional(),
  // Only safe transitions: sent → rejected (admin marks declined), or
  // sent → expired (cron). Going back to draft uses /revise, not this.
  status: z.enum(['rejected', 'expired']).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_proposals');
    const limit = limitByKey(`admin/proposals/[id]:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(raw);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Accepted proposals are locked — the client signed it, admin can't
    // change it out from under them. Explicit 409 so the UI can surface
    // the reason. Rejected/expired can still be edited to re-open.
    const { data: current } = await supabaseAdmin()
      .from('proposals')
      .select('status')
      .eq('id', id)
      .single();
    if ((current?.status as string) === 'accepted') {
      return Response.json(
        { error: 'Proposal is accepted and locked. Edits are disabled.' },
        { status: 409 },
      );
    }

    // Sent proposals are mid-review by the client — mutating title /
    // total_cents / content_json out from under them is a trust break.
    // Admin must explicitly revise back to draft (POST /revise) first.
    // Status transitions (sent → rejected/expired) are still allowed.
    if ((current?.status as string) === 'sent') {
      const dataFields = Object.keys(parsed.data);
      const lockedFields = dataFields.filter((f) =>
        ['title', 'total_cents', 'content_json', 'expires_at'].includes(f),
      );
      if (lockedFields.length > 0) {
        return Response.json(
          {
            error:
              'Proposal is currently sent to the client. Revise to draft before editing.',
          },
          { status: 409 },
        );
      }
    }

    // Status transitions: only allowed when currently 'sent'. Going from
    // draft → rejected makes no sense (just delete it); accepted is locked.
    if (parsed.data.status && (current?.status as string) !== 'sent') {
      return Response.json(
        { error: `Cannot mark proposal as ${parsed.data.status} from ${current?.status}.` },
        { status: 409 },
      );
    }

    // total_cents is a denormalized copy of content_json's total (lists and
    // emails read it). Derive it here rather than trusting a second number
    // from the client that could disagree with the content.
    const update: Record<string, unknown> = { ...parsed.data };
    const investment = (parsed.data.content_json as
      | { investment?: { total_cents?: unknown } }
      | undefined)?.investment;
    if (typeof investment?.total_cents === 'number') {
      update.total_cents = investment.total_cents;
    }

    const { error } = await supabaseAdmin()
      .from('proposals')
      .update(update)
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Marking a sent agreement declined (or expired) closes the offer: its
    // unsigned contract can't be signed anymore. The client declined it, so
    // there's no one to notify; an expiry lapsed on the date they were given.
    if (parsed.data.status) {
      await withdrawUnsigned({
        proposalId: id,
        reason: parsed.data.status === 'rejected' ? 'Declined' : 'Expired',
        actorId: session.userId,
        notifyClient: false,
      });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'proposal',
      entity_id: id,
      diff: { fields: Object.keys(update) },
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_proposals');
    const limit = limitByKey(`admin/proposals/[id]:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    const { data: current } = await supabaseAdmin()
      .from('proposals')
      .select('status')
      .eq('id', id)
      .single();
    if ((current?.status as string) === 'accepted') {
      return Response.json(
        { error: 'Accepted proposals cannot be deleted.' },
        { status: 409 },
      );
    }

    // Block delete if any contract — voided ones included — was generated
    // from this proposal. A contract is a legal record and keeps its
    // proposal; the FK is ON DELETE RESTRICT (crm_contracts_integrity.sql),
    // this check just turns that into a readable error.
    const { count: contractCount } = await supabaseAdmin()
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .eq('proposal_id', id)
      .limit(1);
    if ((contractCount ?? 0) > 0) {
      return Response.json(
        {
          error:
            'A contract was generated from this proposal, so it has to stay as part of that record.',
        },
        { status: 409 },
      );
    }

    const { error } = await supabaseAdmin()
      .from('proposals')
      .delete()
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'proposal',
      entity_id: id,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
