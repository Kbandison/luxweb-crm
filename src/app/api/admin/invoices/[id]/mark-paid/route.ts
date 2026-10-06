import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { writeAudit } from '@/lib/audit';
import { notify, getContactUserId } from '@/lib/notifications';
import {
  applyInvoicePaidEffects,
  claimInvoicePaid,
  paidAtForDate,
  releaseInvoicePaid,
} from '@/lib/invoices/on-paid';
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
 * Shares applyInvoicePaidEffects() with the `invoice.paid` webhook so the
 * money-moved-manually path and the money-moved-through-Stripe path leave the
 * system in the same state: deal bumped, project started, this invoice's
 * milestone closed, client sent a receipt.
 *
 * Stripe is told too, via `paid_out_of_band` — it settles the invoice without
 * charging anything, which stops Stripe's dunning emails from chasing a
 * balance that's already been collected. That's the whole point of the
 * endpoint, so a Stripe failure is surfaced rather than swallowed: silently
 * mirroring only our side would leave Stripe still emailing the client.
 *
 * Order matters. Settling in Stripe makes Stripe fire `invoice.paid` back at
 * us, so the CRM row is claimed FIRST (with the backdated date). The webhook
 * then finds it already paid and leaves it alone — previously it overwrote
 * the backdated date with "now" and could close a second milestone.
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

    const paidAt = paid_on ? paidAtForDate(paid_on) : new Date().toISOString();

    // Claim the row before Stripe hears about it — see the ordering note
    // above. Losing the claim means a payment landed while this dialog was
    // open; report that rather than recording it twice.
    const claimed = await claimInvoicePaid(id, paidAt);
    if (!claimed) {
      return Response.json({ ok: true, already_paid: true });
    }

    if (stripeInvoiceId) {
      try {
        await stripe().invoices.pay(stripeInvoiceId, {
          paid_out_of_band: true,
        });
      } catch (err) {
        // Stripe refuses to settle an invoice that's already paid there —
        // e.g. the client paid by card while the webhook was delayed. The
        // money is real either way, so keep our record.
        const alreadyPaidInStripe = await stripe()
          .invoices.retrieve(stripeInvoiceId)
          .then((inv) => inv.status === 'paid')
          .catch(() => false);
        if (!alreadyPaidInStripe) {
          // Put the row back so the CRM doesn't claim money Stripe will
          // keep chasing the client for.
          await releaseInvoicePaid(id, paidAt, previousStatus);
          const message = err instanceof Error ? err.message : String(err);
          return Response.json(
            {
              error: `Stripe wouldn't settle this invoice out of band: ${message}`,
            },
            { status: 502 },
          );
        }
      }
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

    // Same effects a Stripe payment has: deal → active, project started,
    // and this invoice's milestone closed. Best-effort — the money is
    // already recorded.
    await applyInvoicePaidEffects({
      id,
      contactId,
      projectId,
      amountCents: Number(row.amount_cents ?? 0),
      description: (row.description as string | null) ?? null,
    });

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
