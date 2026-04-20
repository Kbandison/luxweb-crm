import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { writeAudit } from '@/lib/audit';

/**
 * Eager reconciliation for an invoice just after the client returned from
 * Stripe. Closes the race between Stripe's `payment_intent.succeeded`
 * webhook arriving and the client landing back on the invoices page.
 *
 * Idempotent with the webhook: both paths end up doing the same UPDATE.
 * Ownership is verified by the caller (the invoices page already enforces
 * client-owns-project via contacts.user_id in its list query).
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
      'id, status, stripe_invoice_id, amount_cents, contact_id, contacts!inner(user_id)',
    )
    .eq('id', invoiceId)
    .maybeSingle();

  if (!inv) return false;

  type Shape = {
    status: string;
    stripe_invoice_id: string | null;
    amount_cents: number | string | null;
    contacts:
      | { user_id: string | null }
      | { user_id: string | null }[];
  };
  const r = inv as unknown as Shape;
  const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
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
  const { error } = await supabaseAdmin()
    .from('invoices')
    .update({ status: 'paid', paid_at: paidAt })
    .eq('id', invoiceId);
  if (error) return false;

  await writeAudit({
    actor_id: null as unknown as string,
    action: 'update',
    entity_type: 'invoice',
    entity_id: invoiceId,
    diff: {
      status: { from: r.status, to: 'paid' },
      paid_at: paidAt,
      source: 'client_return_reconcile',
    },
  });

  return true;
}
