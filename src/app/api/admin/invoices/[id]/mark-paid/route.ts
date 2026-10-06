import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { writeAudit } from '@/lib/audit';
import { notify, getContactUserId } from '@/lib/notifications';
import { advanceProposalMilestoneChain } from '@/lib/milestones/advance-on-payment';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/admin/invoices/[id]/mark-paid
 *
 * Record a payment that arrived outside Stripe — a check, a wire, Zelle, or
 * money the client handed over before the contract existed. Without this the
 * only route to `paid` is a Stripe charge, so an off-Stripe payment either
 * goes unrecorded or the client gets invoiced for it a second time.
 *
 * Deliberately mirrors the `invoice.paid` webhook's side effects so the
 * money-moved-manually path and the money-moved-through-Stripe path leave the
 * system in the same state: deal bumped, project started, milestone chain
 * advanced, client sent a receipt.
 *
 * Stripe is told too, via `paid_out_of_band` — it settles the invoice without
 * charging anything, which stops Stripe's dunning emails from chasing a
 * balance that's already been collected. That's the whole point of the
 * endpoint, so a Stripe failure is surfaced rather than swallowed: silently
 * mirroring only our side would leave Stripe still emailing the client.
 */
const Schema = z.object({
  /**
   * How the money actually arrived. Required — an invoice marked paid with
   * no stated source is an audit dead end six months later.
   */
  method: z.string().trim().min(2).max(80),
  /** Optional free-text detail: check number, wire reference, etc. */
  note: z.string().trim().max(500).optional(),
  /**
   * When it was received (YYYY-MM-DD). Defaults to now. Backdating matters
   * here — the common case is money that landed before the contract was
   * signed, and the P&L reads paid_at.
   */
  paid_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_billing');
    const limit = limitByKey(`admin/invoices/[id]/mark-paid:${session.userId}`, {
      capacity: 30,
      refillPerSec: 30 / 60,
    });
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
    const { method, note, paid_on } = parsed.data;

    const sb = supabaseAdmin();
    const { data: row } = await sb
      .from('invoices')
      .select(
        'id, status, stripe_invoice_id, amount_cents, description, contact_id, project_id, hosted_invoice_url',
      )
      .eq('id', id)
      .maybeSingle();

    if (!row) return Response.json({ error: 'Not found' }, { status: 404 });

    const previousStatus = row.status as string;
    if (previousStatus === 'paid') {
      // Idempotent: re-recording the same payment shouldn't double-advance
      // the milestone chain or re-send the client a receipt.
      return Response.json({ ok: true, already_paid: true });
    }
    if (previousStatus === 'void') {
      return Response.json(
        { error: 'Voided invoices cannot be marked paid. Raise a new one.' },
        { status: 409 },
      );
    }

    const stripeInvoiceId = row.stripe_invoice_id as string | null;
    const projectId = row.project_id as string | null;
    const contactId = row.contact_id as string;

    // Settle it in Stripe first. If this fails we stop rather than mirror,
    // because a half-applied state (paid here, still open + dunning there)
    // is the exact confusion this endpoint exists to prevent.
    if (stripeInvoiceId) {
      try {
        await stripe().invoices.pay(stripeInvoiceId, {
          paid_out_of_band: true,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return Response.json(
          {
            error: `Stripe wouldn't settle this invoice out of band: ${message}`,
          },
          { status: 502 },
        );
      }
    }

    // Backdated dates are stamped at noon UTC so the calendar day survives
    // being read back in Eastern time — midnight UTC would render as the
    // previous day in the P&L and on the client's receipt.
    const paidAt = paid_on
      ? new Date(`${paid_on}T12:00:00.000Z`).toISOString()
      : new Date().toISOString();

    const { error: updateErr } = await sb
      .from('invoices')
      .update({ status: 'paid', paid_at: paidAt })
      .eq('id', id);
    if (updateErr) {
      return Response.json({ error: updateErr.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'invoice',
      entity_id: id,
      diff: {
        status: { from: previousStatus, to: 'paid' },
        paid_at: paidAt,
        source: 'manual_out_of_band',
        method,
        ...(note ? { note } : {}),
      },
    });

    // From here down: the same side effects the Stripe webhook fires, so a
    // manually-recorded payment moves the project exactly as far as a
    // Stripe one would. All best-effort — the money is already recorded.
    try {
      await sb
        .from('deals')
        .update({ stage: 'active', stage_changed_at: new Date().toISOString() })
        .eq('contact_id', contactId)
        .in('stage', ['lead', 'discovery', 'proposal']);
    } catch {
      // Best-effort.
    }

    if (projectId) {
      try {
        await sb
          .from('projects')
          .update({ status: 'in_progress' })
          .eq('id', projectId)
          .eq('status', 'planning');
      } catch {
        // Best-effort.
      }
      await advanceProposalMilestoneChain(projectId);
      revalidateProject(projectId);
    }

    // Receipt to the client. This is the part that answers "have you got my
    // money?" — worth sending precisely because they paid outside the portal
    // and have nothing there confirming it landed.
    try {
      const clientUserId = await getContactUserId(contactId);
      if (clientUserId) {
        await notify({
          type: 'invoice_paid',
          userId: clientUserId,
          invoiceId: id,
          description: (row.description as string) ?? 'Invoice',
          amountCents: Number(row.amount_cents ?? 0),
          paidAt,
          hostedInvoiceUrl: (row.hosted_invoice_url as string) ?? null,
          invoicePath: projectId
            ? `/portal/project/${projectId}/invoices`
            : '/portal/dashboard',
        });
      }
    } catch (err) {
      console.warn('[mark-paid] client receipt failed:', err);
    }

    // No admin "payment_received" fan-out here: the studio just recorded
    // this by hand, so emailing themselves about it is noise.

    return Response.json({ ok: true, paid_at: paidAt });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/invoices/[id]/mark-paid POST', err);
  }
}
