import { appBaseUrl } from '@/lib/app-url';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getContactUserId } from '@/lib/notifications';
import { sendPortalInvite } from '@/lib/invites';
import { flattenJoin } from '@/lib/array-join';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';
import type { ProposalContent } from '@/lib/types/proposal';

export const runtime = 'nodejs';

/**
 * POST /api/admin/contracts/[id]/resend — send the client the sign request
 * again: same agreement, same link. For an email that got buried, bounced
 * to spam, or went out broken. Revise & resend is for changing the terms —
 * it voids the contract and tells the client it was withdrawn.
 *
 * A client with portal access gets the "ready to sign" email again; one
 * without gets a fresh portal invite, which lands them on the agreement —
 * the same split as the first send. Only while it's open for signature.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_proposals');
    const { id } = await params;
    // A few an hour per agreement: enough to fix a missed email, not
    // enough to flood a client from a double click.
    const limit = limitByKey(`admin/contracts/resend:${id}`, {
      capacity: 3,
      refillPerSec: 3 / 3600,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const sb = supabaseAdmin();
    const { data } = await sb
      .from('contracts')
      .select(
        'id, status, contact_id, proposal_id, content_snapshot, proposals!inner(title, status, expires_at, content_json)',
      )
      .eq('id', id)
      .maybeSingle();
    if (!data) return Response.json({ error: 'Not found' }, { status: 404 });

    type Row = {
      id: string;
      status: string;
      contact_id: string;
      proposal_id: string;
      content_snapshot: ProposalContent | null;
      proposals:
        | { title: string; status: string; expires_at: string | null; content_json: ProposalContent | null }
        | { title: string; status: string; expires_at: string | null; content_json: ProposalContent | null }[];
    };
    const contract = data as unknown as Row;
    const proposal = flattenJoin(contract.proposals);
    const expired =
      proposal?.status === 'expired' ||
      (proposal?.expires_at != null && new Date(proposal.expires_at).getTime() <= Date.now());

    if (contract.status !== 'pending_client_signature' || !proposal) {
      return Response.json(
        { error: "Only an agreement waiting on the client's signature can be resent." },
        { status: 409 },
      );
    }
    if (expired) {
      return Response.json(
        { error: 'This agreement has expired. Use Revise & resend to send a fresh one.' },
        { status: 409 },
      );
    }

    const clientUserId = await getContactUserId(contract.contact_id);
    let via: 'email' | 'invite';
    if (clientUserId) {
      // notify() quietly skips the email for a client who turned these off;
      // say so rather than report a send that didn't happen.
      const { data: user } = await sb
        .from('users')
        .select('email_prefs')
        .eq('id', clientUserId)
        .maybeSingle();
      const prefs = (user?.email_prefs ?? {}) as Record<string, boolean>;
      if (prefs.contract_pending_client_signature === false) {
        return Response.json(
          {
            error:
              'This client turned off agreement emails in their portal settings. Send them the link directly.',
          },
          { status: 409 },
        );
      }
      const content = contract.content_snapshot ?? proposal.content_json;
      await notify({
        type: 'contract_pending_client_signature',
        userId: clientUserId,
        contractId: contract.id,
        proposalId: contract.proposal_id,
        clientName: content?.client?.name ?? '',
        contractPath: `/portal/contracts/${contract.id}`,
        title: proposal.title,
        expiresAt: proposal.expires_at,
      });
      via = 'email';
    } else {
      const origin = req.headers.get('origin') ?? (appBaseUrl() || 'http://localhost:3000');
      const invite = await sendPortalInvite({
        contactId: contract.contact_id,
        origin,
        actorId: session.userId,
      });
      if (!invite.ok) {
        return Response.json({ error: invite.error }, { status: invite.status });
      }
      via = 'invite';
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'resend',
      entity_type: 'contract',
      entity_id: contract.id,
      diff: { via },
    });

    return Response.json({ ok: true, via });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/contracts/[id]/resend', err);
  }
}
