import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { writeAudit } from '@/lib/audit';
import {
  applyInvoicePaidEffects,
  claimInvoicePaid,
  notifyInvoicePaid,
} from '@/lib/invoices/on-paid';
import { flattenJoin } from '@/lib/array-join';

/**
 * Eager reconciliation for an invoice just after the client returned from
 * Stripe. Closes the race between Stripe's `payment_intent.succeeded`
 * webhook arriving and the client landing back on the invoices page.
 *
 * Shares claimInvoicePaid() with the webhook, so whichever arrives first
 * records the payment and runs the side effects and notifications; the
 * other is a no-op. Ownership is verified here against contacts.user_id.
 *
 * Returns `true` if the row was flipped to paid as a result of this call,
 * `false` if nothing changed (already paid, voided, or no succeeded PI yet).
 */
export async function reconcileInvoicePaid(
  invoiceId: string,
  userId: string,
): Promise<boolean> {
  // Verify the invoice belongs to a contact owned by this user.
  const { data: inv } = await supabaseAdmin()
    .from('invoices')
    .select(
      'id, status, stripe_invoice_id, amount_cents, description, hosted_invoice_url, contact_id, project_id, contacts!inner(user_id)',
    )
    .eq('id', invoiceId)
    .maybeSingle();

  if (!inv) return false;

  type Shape = {
    status: string;
    stripe_invoice_id: string | null;
    amount_cents: number | string | null;
    description: string | null;
    hosted_invoice_url: string | null;
    contact_id: string;
    project_id: string | null;
    contacts:
      | { user_id: string | null }
      | { user_id: string | null }[];
  };
  const r = inv as unknown as Shape;
  const contact = flattenJoin(r.contacts);
  if (!contact || contact.user_id !== userId) return false;

  // Already terminal — nothing to do.
  if (r.status === 'paid' || r.status === 'void') return false;

  // Search Stripe for a succeeded PaymentIntent that cites this CRM invoice
  // via metadata. PaymentIntents created by our pay page set metadata.crm_invoice_id.
  let succeeded = false;
  try {
    const result = await stripe().paymentIntents.search({
      query: `metadata['crm_invoice_id']:'${invoiceId}' AND status:'succeeded'`,
      limit: 1,
    });
    succeeded = result.data.length > 0;
  } catch {
    // Stripe search is eventually consistent and occasionally returns
    // errors for recently-created PIs. Treat as "not yet paid" — the
    // webhook will reconcile shortly.
    return false;
  }

  if (!succeeded) return false;

  const paidAt = new Date().toISOString();
  let claimed: boolean;
  try {
    claimed = await claimInvoicePaid(invoiceId, paidAt);
  } catch {
    return false;
  }
  if (!claimed) return false;

  await writeAudit({
    actor_id: null,
    action: 'update',
    entity_type: 'invoice',
    entity_id: invoiceId,
    diff: {
      status: { from: r.status, to: 'paid' },
      paid_at: paidAt,
      source: 'client_return_reconcile',
    },
  });

  // Same effects and notifications as the webhook — this path wins the race
  // whenever the client lands back before Stripe's event does.
  await applyInvoicePaidEffects({
    id: invoiceId,
    contactId: r.contact_id,
    projectId: r.project_id,
    amountCents: Number(r.amount_cents ?? 0),
    description: r.description,
  });
  await notifyInvoicePaid({
    invoiceId,
    contactId: r.contact_id,
    projectId: r.project_id,
    description: r.description ?? 'Invoice',
    amountCents: Number(r.amount_cents ?? 0),
    paidAt,
    hostedInvoiceUrl: r.hosted_invoice_url,
  });

  return true;
}
