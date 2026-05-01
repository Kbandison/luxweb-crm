import 'server-only';
import { stripe } from '@/lib/stripe';

export type CarePlanInvoice = {
  id: string;
  number: string | null;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  amountDueCents: number;
  amountPaidCents: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
};

/**
 * Pull the recent Stripe invoices for a subscription. Returns newest-first.
 *
 * Reads directly from Stripe so we don't have to mirror invoice rows for
 * the recurring subscription path. Fails soft — any error returns [].
 */
export async function getCarePlanInvoiceHistory(
  stripeSubscriptionId: string,
  limit = 6,
): Promise<CarePlanInvoice[]> {
  try {
    const list = await stripe().invoices.list({
      subscription: stripeSubscriptionId,
      limit,
    });
    return list.data.map((inv) => ({
      id: inv.id ?? '',
      number: inv.number ?? null,
      status: (inv.status ?? 'open') as CarePlanInvoice['status'],
      amountDueCents: inv.amount_due ?? 0,
      amountPaidCents: inv.amount_paid ?? 0,
      currency: inv.currency ?? 'usd',
      createdAt: inv.created
        ? new Date(inv.created * 1000).toISOString()
        : new Date().toISOString(),
      paidAt:
        inv.status_transitions?.paid_at != null
          ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
          : null,
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      invoicePdf: inv.invoice_pdf ?? null,
    }));
  } catch {
    return [];
  }
}
