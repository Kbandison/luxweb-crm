import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getAdminUserId } from '@/lib/notifications';
import {
  deriveContractVariables,
  renderAgreement,
} from '@/lib/contracts/render';
import type { ProposalContent } from '@/lib/types/proposal';

export const runtime = 'nodejs';

const Schema = z.object({
  full_name: z.string().min(2).max(200),
  agreed: z.literal(true),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Look up the proposal + its contact's portal user. Ownership is
    // verified via contacts.user_id. Works for project-scoped and direct
    // contact-scoped proposals identically.
    const { data: row } = await supabaseAdmin()
      .from('proposals')
      .select(
        'id, status, title, total_cents, project_id, contact_id, content_json, contacts!inner(full_name, user_id)',
      )
      .eq('id', id)
      .single();

    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    type Shape = {
      status: string;
      title: string;
      total_cents: number | string | null;
      project_id: string | null;
      contact_id: string | null;
      content_json: unknown;
      contacts:
        | { full_name: string; user_id: string | null }
        | { full_name: string; user_id: string | null }[];
    };
    const r = row as unknown as Shape;
    const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;

    if (!contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    if (r.status !== 'sent') {
      return Response.json(
        { error: `Proposal is ${r.status}, no longer accepting.` },
        { status: 409 },
      );
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      null;
    const userAgent = req.headers.get('user-agent') ?? null;
    const acceptedAt = new Date().toISOString();

    const { error } = await supabaseAdmin()
      .from('proposals')
      .update({
        status: 'accepted',
        accepted_at: acceptedAt,
        accepted_by_name: parsed.data.full_name,
        accepted_by_ip: ip,
        accepted_by_user_agent: userAgent,
      })
      .eq('id', id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'accept',
      entity_type: 'proposal',
      entity_id: id,
      diff: {
        signed_name: parsed.data.full_name,
        ip,
        user_agent: userAgent,
        accepted_at: acceptedAt,
      },
    });

    // Auto-generate a pending-signature contract from the Agreement
    // template. The body is frozen at this moment — snapshot of the
    // proposal's economic terms + the boilerplate legal text. The client
    // sees this as a second step in the portal and signs separately,
    // proving two distinct assents (pricing + terms).
    let contractId: string | null = null;
    try {
      const content = (r.content_json ?? null) as ProposalContent | null;
      if (content) {
        const variables = deriveContractVariables(content, {
          effectiveDate: acceptedAt,
        });
        const agreementVersion = content.agreement_version || '1.1';
        const { body_md, version } = await renderAgreement(variables, {
          version: `v${agreementVersion.replace(/^v/, '')}`,
        });

        const { data: cRow, error: cErr } = await supabaseAdmin()
          .from('contracts')
          .insert({
            proposal_id: id,
            project_id: r.project_id,
            contact_id: r.contact_id,
            agreement_version: version,
            body_md,
            variables,
            status: 'pending_signature',
          })
          .select('id')
          .single();
        if (cErr) {
          console.warn('[accept] failed to create contract:', cErr.message);
        } else {
          contractId = (cRow?.id as string | undefined) ?? null;
          await writeAudit({
            actor_id: session.userId,
            action: 'create',
            entity_type: 'contract',
            entity_id: contractId ?? undefined,
            diff: {
              proposal_id: id,
              agreement_version: version,
              source: 'proposal_accept_auto_gen',
            },
          });
        }
      }
    } catch (err) {
      // Contract generation failing shouldn't block proposal acceptance —
      // we log and let the admin regenerate manually if needed. The
      // proposal is already accepted by this point.
      console.warn('[accept] contract generation error:', err);
    }

    // Notify the admin that a proposal was accepted.
    const adminId = await getAdminUserId();
    if (adminId) {
      const proposalPath = r.project_id
        ? `/admin/projects/${r.project_id}/proposals/${id}`
        : `/admin/proposals/${id}`;
      await notify({
        type: 'proposal_accepted',
        userId: adminId,
        proposalId: id,
        title: r.title,
        totalCents: r.total_cents == null ? null : Number(r.total_cents),
        clientName: contact.full_name,
        acceptedAt,
        proposalPath,
      });
    }

    // Stripe deposit-invoice auto-generation can wire in here as a follow-up.
    return Response.json({
      ok: true,
      accepted_at: acceptedAt,
      contract_id: contractId,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
