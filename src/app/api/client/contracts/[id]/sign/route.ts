import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getAdminUserId } from '@/lib/notifications';

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

    // Ownership via the join to contacts.user_id — same pattern as the
    // proposal accept route.
    const { data: row } = await supabaseAdmin()
      .from('contracts')
      .select(
        'id, status, agreement_version, proposal_id, project_id, contact_id, contacts!inner(full_name, user_id), proposals!inner(title, total_cents)',
      )
      .eq('id', id)
      .single();

    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    type Shape = {
      status: string;
      agreement_version: string;
      proposal_id: string;
      project_id: string | null;
      contact_id: string;
      contacts:
        | { full_name: string; user_id: string | null }
        | { full_name: string; user_id: string | null }[];
      proposals:
        | { title: string; total_cents: number | string | null }
        | { title: string; total_cents: number | string | null }[];
    };
    const r = row as unknown as Shape;
    const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    const proposal = Array.isArray(r.proposals) ? r.proposals[0] : r.proposals;

    if (!contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    if (r.status !== 'pending_signature') {
      return Response.json(
        { error: `Contract is ${r.status}, no longer accepting signature.` },
        { status: 409 },
      );
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      null;
    const userAgent = req.headers.get('user-agent') ?? null;
    const signedAt = new Date().toISOString();

    const { error } = await supabaseAdmin()
      .from('contracts')
      .update({
        status: 'signed',
        signed_at: signedAt,
        signed_name: parsed.data.full_name,
        signed_ip: ip,
        signed_user_agent: userAgent,
      })
      .eq('id', id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'sign',
      entity_type: 'contract',
      entity_id: id,
      diff: {
        signed_name: parsed.data.full_name,
        ip,
        user_agent: userAgent,
        signed_at: signedAt,
        agreement_version: r.agreement_version,
      },
    });

    const adminId = await getAdminUserId();
    if (adminId) {
      const contractPath = r.project_id
        ? `/admin/projects/${r.project_id}/contracts/${id}`
        : `/admin/dashboard`;
      await notify({
        type: 'contract_signed',
        userId: adminId,
        contractId: id,
        proposalId: r.proposal_id,
        title: proposal?.title ?? 'Contract',
        totalCents:
          proposal?.total_cents == null ? null : Number(proposal.total_cents),
        clientName: contact.full_name,
        signedAt,
        agreementVersion: r.agreement_version,
        contractPath,
      });
    }

    return Response.json({ ok: true, signed_at: signedAt });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
