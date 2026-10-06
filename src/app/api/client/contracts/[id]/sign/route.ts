import { after } from 'next/server';
import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getAdminUserIds } from '@/lib/notifications';
import { sendExecutedCopy, signAgreement } from '@/lib/contracts/after-sign';
import { namesMatch } from '@/lib/signatures/match';
import type { ProposalContent } from '@/lib/types/proposal';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { flattenJoin } from '@/lib/array-join';

export const runtime = 'nodejs';

const Schema = z.object({
  full_name: z.string().min(2).max(200),
  agreed: z.literal(true),
  /**
   * Fingerprint of the agreement text the client was shown. Must match the
   * contract's — proof they signed exactly what's on file.
   */
  body_sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});

/**
 * The client signs the agreement — the one signature in the flow. The studio
 * signed when sending, so this executes it. See signAgreement: the contract,
 * the agreement's acceptance, the project, milestones and prepaid payments
 * land in one transaction; the deposit invoice follows; the signed PDF goes
 * to both parties after the response.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const limit = limitByKey(`client/contracts/[id]/sign:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
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

    const sb = supabaseAdmin();
    const { data: row } = await sb
      .from('contracts')
      .select(
        'id, status, agreement_version, body_sha256, content_snapshot, proposal_id, project_id, contact_id, contacts!inner(full_name, user_id), proposals!inner(title, total_cents, content_json, deal_id, status, expires_at)',
      )
      .eq('id', id)
      .single();

    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    type Shape = {
      status: string;
      agreement_version: string;
      body_sha256: string | null;
      content_snapshot: ProposalContent | null;
      proposal_id: string;
      project_id: string | null;
      contact_id: string;
      contacts:
        | { full_name: string; user_id: string | null }
        | { full_name: string; user_id: string | null }[];
      proposals:
        | {
            title: string;
            total_cents: number | string | null;
            content_json: ProposalContent | null;
            deal_id: string | null;
            status: string;
            expires_at: string | null;
          }
        | {
            title: string;
            total_cents: number | string | null;
            content_json: ProposalContent | null;
            deal_id: string | null;
            status: string;
            expires_at: string | null;
          }[];
    };
    const r = row as unknown as Shape;
    const contact = flattenJoin(r.contacts);
    const proposal = flattenJoin(r.proposals);

    if (!contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    if (
      r.status !== 'pending_client_signature' &&
      r.status !== 'pending_signature'
    ) {
      return Response.json(
        {
          error:
            r.status === 'signed'
              ? 'This agreement is already signed.'
              : 'This agreement is no longer open for signing.',
        },
        { status: 409 },
      );
    }

    if (proposal?.expires_at && new Date(proposal.expires_at) <= new Date()) {
      return Response.json(
        { error: 'This agreement has expired. Contact us for an updated one.' },
        { status: 410 },
      );
    }

    // The text they read must be the text on file.
    if (r.body_sha256 && parsed.data.body_sha256 !== r.body_sha256) {
      return Response.json(
        {
          error:
            'The agreement changed since this page loaded. Reload to see the current version before signing.',
        },
        { status: 409 },
      );
    }

    if (!namesMatch(parsed.data.full_name, contact.full_name)) {
      return Response.json(
        {
          error: `Signature must match the name on file: ${contact.full_name}.`,
        },
        { status: 422 },
      );
    }

    const content = r.content_snapshot ?? proposal?.content_json ?? null;
    if (!content) {
      return Response.json(
        { error: 'This agreement is missing its details. Contact us.' },
        { status: 409 },
      );
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      null;
    const userAgent = req.headers.get('user-agent') ?? null;
    const signedAt = new Date().toISOString();

    let result: Awaited<ReturnType<typeof signAgreement>>;
    try {
      result = await signAgreement({
        contractId: id,
        clientUserId: session.userId,
        contactId: r.contact_id,
        contractProjectId: r.project_id,
        signature: { name: parsed.data.full_name, ip, userAgent, signedAt },
        proposal: {
          title: proposal?.title ?? '',
          totalCents: proposal?.total_cents == null ? null : Number(proposal.total_cents),
          dealId: proposal?.deal_id ?? null,
        },
        content,
      });
    } catch (err) {
      // The transaction rolled back — nothing was signed. Safe to retry.
      console.error('[contract sign] failed:', err);
      await writeAudit({
        actor_id: session.userId,
        action: 'sign_failed',
        entity_type: 'contract',
        entity_id: id,
        diff: { message: err instanceof Error ? err.message : String(err) },
      });
      return Response.json(
        { error: "We couldn't record your signature. Nothing was signed — please try again." },
        { status: 500 },
      );
    }

    if (!result.ok) {
      return Response.json(
        {
          error:
            result.reason === 'already_signed'
              ? 'This agreement is already signed.'
              : 'This agreement is no longer open for signing.',
        },
        { status: 409 },
      );
    }

    const { projectId, depositState, depositInvoiceId } = result;

    // Studio alert.
    const adminIds = await getAdminUserIds();
    await Promise.all(
      adminIds.map((userId) =>
        notify({
          type: 'contract_signed',
          userId,
          contractId: id,
          proposalId: r.proposal_id,
          title: proposal?.title ?? 'Agreement',
          totalCents: proposal?.total_cents == null ? null : Number(proposal.total_cents),
          clientName: contact.full_name,
          signedAt,
          agreementVersion: r.agreement_version,
          contractPath: `/admin/projects/${projectId}/contracts/${id}`,
        }),
      ),
    );

    // The executed PDF to both parties — after the response, so the client
    // isn't waiting on a PDF render and two emails to see their signature
    // land. A failure leaves executed_copy_sent_at empty for Finish setup.
    after(async () => {
      await sendExecutedCopy(id);
    });

    revalidateProject(projectId);

    return Response.json({
      ok: true,
      signed_at: signedAt,
      project_id: projectId,
      deposit_invoice_id: depositInvoiceId,
      // Mapped to the client's success message: 'invoiced' → pay now;
      // 'collected' → already received; 'failed'/'pending' → on its way.
      deposit_status:
        depositState === 'invoiced'
          ? 'invoiced'
          : depositState === 'collected'
            ? 'collected'
            : depositState === 'not_required'
              ? 'none'
              : 'failed',
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
