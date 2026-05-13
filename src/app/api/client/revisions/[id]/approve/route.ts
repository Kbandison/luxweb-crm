import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getAdminUserIds } from '@/lib/notifications';
import { createAndSendInvoice } from '@/lib/invoices/create';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { flattenJoin } from '@/lib/array-join';

export const runtime = 'nodejs';

/**
 * Client approves a milestone review request.
 *
 *   - Flips revision_request status to 'approved'
 *   - Auto-fires the invoice for that milestone (using milestone.amount_cents)
 *     and links it via milestones.invoice_id, so client can pay immediately
 *   - DOES NOT mark the milestone done — that happens when the payment
 *     lands and the existing advance-chain runs
 *   - Notifies admin
 *
 * Reuses an existing invoice if milestone.invoice_id is already set and
 * the invoice isn't paid/void (e.g., admin re-asks for review after a
 * Request Changes round).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const limit = limitByKey(`client/revisions/[id]/approve:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: row } = await sb
      .from('revision_requests')
      .select(
        `id, status, project_id, milestone_id, contact_id, title,
         contacts!inner(user_id, full_name),
         projects!inner(name)`,
      )
      .eq('id', id)
      .maybeSingle();
    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    type Shape = {
      status: string;
      project_id: string;
      milestone_id: string | null;
      contact_id: string;
      title: string;
      contacts:
        | { user_id: string | null; full_name: string }
        | { user_id: string | null; full_name: string }[];
      projects: { name: string } | { name: string }[];
    };
    const r = row as unknown as Shape;
    const contact = flattenJoin(r.contacts);
    const project = flattenJoin(r.projects);

    if (!contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (r.status !== 'pending_review') {
      return Response.json(
        { error: `Review is ${r.status}; only pending reviews can be approved.` },
        { status: 409 },
      );
    }
    if (!r.milestone_id) {
      return Response.json(
        { error: 'Review is not linked to a milestone.' },
        { status: 400 },
      );
    }

    const approvedAt = new Date().toISOString();

    // Flip review → approved.
    const { error: revErr } = await sb
      .from('revision_requests')
      .update({
        status: 'approved',
        resolved_at: approvedAt,
        resolved_by: session.userId,
      })
      .eq('id', id);
    if (revErr) {
      return Response.json({ error: revErr.message }, { status: 500 });
    }

    // Look up the milestone's payment info.
    const { data: ms } = await sb
      .from('milestones')
      .select('id, title, amount_cents, invoice_id')
      .eq('id', r.milestone_id)
      .maybeSingle();
    type MR = {
      id: string;
      title: string;
      amount_cents: number | string | null;
      invoice_id: string | null;
    };
    const m = ms as unknown as MR | null;

    // Decide whether to fire a new invoice. Skip if a non-terminal one
    // already exists (e.g., a re-approved milestone after request-changes).
    // Always resolve the *effective* invoice id (existing or new) so the
    // client can redirect straight to the pay page.
    let invoiceId: string | null = null;
    if (m && m.amount_cents != null && Number(m.amount_cents) > 0) {
      let needsNew = true;
      if (m.invoice_id) {
        const { data: existing } = await sb
          .from('invoices')
          .select('id, status')
          .eq('id', m.invoice_id)
          .maybeSingle();
        const existingStatus = (existing as { status: string } | null)?.status;
        if (existingStatus && existingStatus !== 'void') {
          needsNew = false;
          invoiceId = m.invoice_id;
        }
      }

      if (needsNew) {
        try {
          const result = await createAndSendInvoice({
            projectId: r.project_id,
            amountCents: Number(m.amount_cents),
            description: `${m.title} — ${project?.name ?? 'Project'}`,
            actorId: null,
            source: 'milestone_approve_auto',
          });
          invoiceId = result.invoiceId;
          await sb
            .from('milestones')
            .update({ invoice_id: result.invoiceId })
            .eq('id', m.id);
        } catch (err) {
          // Don't block the approval if billing fails. Admin can raise
          // the invoice manually from the project's Invoices tab.
          console.warn('[approve] auto-invoice failed:', err);
        }
      }
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'approve',
      entity_type: 'revision_request',
      entity_id: id,
      diff: {
        milestone_id: r.milestone_id,
        invoice_id: invoiceId,
        by: 'client',
      },
    });

    // Notify admin(s).
    const adminIds = await getAdminUserIds();
    if (adminIds.length > 0) {
      await Promise.all(
        adminIds.map((userId) =>
          notify({
            type: 'revision_updated',
            userId,
            revisionId: id,
            title: r.title,
            projectId: r.project_id,
            projectName: project?.name ?? '—',
            kind: 'status',
            statusLabel: invoiceId ? 'Approved · invoice sent' : 'Approved',
            revisionPath: `/admin/projects/${r.project_id}/revisions/${id}`,
          }),
        ),
      );
    }

    revalidateProject(r.project_id);

    return Response.json({
      ok: true,
      invoice_id: invoiceId,
      project_id: r.project_id,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('client/revisions/[id]/approve', err);
  }
}
