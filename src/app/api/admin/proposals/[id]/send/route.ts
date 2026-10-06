import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getContactUserId } from '@/lib/notifications';
import { sendPortalInvite } from '@/lib/invites';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { problemsBeforeSend } from '@/lib/proposals/validate';
import { CURRENT_AGREEMENT_VERSION } from '@/lib/contracts/versions';
import { deriveContractVariables, renderAgreement } from '@/lib/contracts/render';
import { bodyFingerprint } from '@/lib/contracts/after-sign';
import { namesMatch } from '@/lib/signatures/match';
import { safeError } from '@/lib/safe-error';
import { pairTimelineAndMilestones, type ProposalContent } from '@/lib/types/proposal';
import { DEFAULT_EXPIRY_DAYS } from '@/lib/agreements/expiry';

export const runtime = 'nodejs';

const Schema = z.object({
  /** The studio's typed signature — must match the sender's name on file. */
  full_name: z.string().min(2).max(200),
  agreed: z.literal(true),
  expires_in_days: z.number().int().min(1).max(90).optional(),
});

/**
 * POST /api/admin/proposals/[id]/send — Sign & send.
 *
 * The studio signs when it sends: the Agreement is rendered from the draft,
 * frozen with its SHA-256 and a snapshot of the draft, signed by the sender,
 * and offered to the client until it expires. The client then reviews and
 * signs once — no counter-signature round trip.
 *
 * Refuses (422, with `problems`) when the draft isn't fit to become an
 * Agreement.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_proposals');
    const limit = limitByKey(`admin/proposals/[id]/send:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Type your full name and confirm to sign and send.' },
        { status: 400 },
      );
    }

    const sb = supabaseAdmin();
    const { data: before } = await sb
      .from('proposals')
      .select('status, title, contact_id, project_id, content_json, revision')
      .eq('id', id)
      .single();
    if (!before) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if ((before.status as string) !== 'draft') {
      return Response.json(
        { error: `Agreement is already ${before.status}.` },
        { status: 409 },
      );
    }

    const stored = before.content_json as ProposalContent | null;
    if (!stored) {
      return Response.json({ error: 'Agreement has no content yet.' }, { status: 422 });
    }
    const problems = problemsBeforeSend(stored);
    if (problems.length > 0) {
      return Response.json(
        { error: 'Fix these before sending.', problems },
        { status: 422 },
      );
    }

    // The sender's typed signature must match their name on file.
    const { data: sender } = await sb
      .from('users')
      .select('full_name')
      .eq('id', session.userId)
      .maybeSingle();
    const senderName = (sender as { full_name: string | null } | null)?.full_name ?? null;
    if (!namesMatch(parsed.data.full_name, senderName)) {
      return Response.json(
        {
          error: senderName
            ? `Signature must match your name on file: ${senderName}.`
            : 'No full name on your account. Add it to your profile before signing.',
        },
        { status: 422 },
      );
    }

    // Pin the version and freeze what's being sent.
    const content: ProposalContent = pairTimelineAndMilestones({
      ...stored,
      agreement_version: CURRENT_AGREEMENT_VERSION,
    });
    const sentAt = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + (parsed.data.expires_in_days ?? DEFAULT_EXPIRY_DAYS) * 86_400_000,
    ).toISOString();
    const variables = deriveContractVariables(content, { effectiveDate: sentAt });
    const { body_md, version } = await renderAgreement(variables, {
      version: `v${CURRENT_AGREEMENT_VERSION}`,
    });
    const bodySha256 = bodyFingerprint(body_md);

    // Claim the send — only from draft, so a double-click can't send twice.
    const { data: sentRows, error: sendErr } = await sb
      .from('proposals')
      .update({
        status: 'sent',
        sent_at: sentAt,
        expires_at: expiresAt,
        content_json: content,
        total_cents: content.investment.total_cents,
      })
      .eq('id', id)
      .eq('status', 'draft')
      .select('id');
    if (sendErr) return Response.json({ error: sendErr.message }, { status: 500 });
    if ((sentRows ?? []).length === 0) {
      return Response.json({ error: 'Agreement was already sent.' }, { status: 409 });
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      null;
    const userAgent = req.headers.get('user-agent') ?? null;

    const { data: contract, error: contractErr } = await sb
      .from('contracts')
      .insert({
        proposal_id: id,
        project_id: before.project_id,
        contact_id: before.contact_id,
        agreement_version: version,
        body_md,
        body_sha256: bodySha256,
        content_snapshot: content,
        variables,
        status: 'pending_client_signature',
        admin_signed_name: parsed.data.full_name,
        admin_signed_at: sentAt,
        admin_signed_ip: ip,
        admin_signed_user_agent: userAgent,
      })
      .select('id')
      .single();

    if (contractErr || !contract) {
      // Undo the send so the draft can be fixed and sent again.
      await sb
        .from('proposals')
        .update({ status: 'draft', sent_at: null, expires_at: null })
        .eq('id', id)
        .eq('status', 'sent');
      return Response.json(
        { error: contractErr?.message ?? 'Failed to create the agreement.' },
        { status: 500 },
      );
    }
    const contractId = (contract as { id: string }).id;

    await writeAudit({
      actor_id: session.userId,
      action: 'send',
      entity_type: 'proposal',
      entity_id: id,
      diff: {
        status: { from: 'draft', to: 'sent' },
        sent_at: sentAt,
        expires_at: expiresAt,
        revision: before.revision ?? 1,
        contract_id: contractId,
      },
    });
    await writeAudit({
      actor_id: session.userId,
      action: 'sign',
      entity_type: 'contract',
      entity_id: contractId,
      diff: {
        signed_name: parsed.data.full_name,
        ip,
        user_agent: userAgent,
        signed_at: sentAt,
        agreement_version: version,
        body_sha256: bodySha256,
        by: 'studio',
      },
    });

    const projectId = before.project_id as string | null;
    if (projectId) revalidateProject(projectId);

    // Tell the client. With portal access they get "ready to sign"; without
    // it they're invited, and the invite lands them on the agreement.
    const contactId = before.contact_id as string;
    const clientUserId = await getContactUserId(contactId);
    if (clientUserId) {
      await notify({
        type: 'contract_pending_client_signature',
        userId: clientUserId,
        contractId,
        proposalId: id,
        clientName: content.client.name,
        contractPath: `/portal/contracts/${contractId}`,
        title: before.title as string,
        expiresAt,
      });
    } else {
      const origin =
        req.headers.get('origin') ??
        process.env.NEXT_PUBLIC_APP_URL ??
        'http://localhost:3000';
      const invite = await sendPortalInvite({ contactId, origin, actorId: session.userId });
      if (!invite.ok) {
        console.warn(`[agreement send] auto-invite failed for contact=${contactId}: ${invite.error}`);
      }
    }

    return Response.json({ ok: true, sent_at: sentAt, expires_at: expiresAt, contract_id: contractId });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/proposals/[id]/send', err);
  }
}
