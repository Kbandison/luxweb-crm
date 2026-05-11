import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getAdminUserId } from '@/lib/notifications';
import { namesMatch } from '@/lib/signatures/match';

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

    if (!namesMatch(parsed.data.full_name, contact.full_name)) {
      return Response.json(
        {
          error: `Signature must match the name on file: ${contact.full_name}.`,
        },
        { status: 422 },
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

    // Notify the admin that the proposal was accepted. Under the new
    // two-signature flow, the contract isn't generated here — admin signs
    // first via /admin/projects/[id]/agreement, which creates the contract
    // row with their signature captured, then the client signs separately.
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

    // Also send a confirmation to the client so they know we received
    // the acceptance and what to expect next. Without this they're left
    // hanging until admin counter-signs.
    await notify({
      type: 'proposal_accepted_client',
      userId: session.userId,
      proposalId: id,
      title: r.title,
      totalCents: r.total_cents == null ? null : Number(r.total_cents),
      acceptedAt,
      portalPath: r.project_id
        ? `/portal/project/${r.project_id}`
        : '/portal/dashboard',
    });

    return Response.json({ ok: true, accepted_at: acceptedAt });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
