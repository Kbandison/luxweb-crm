import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { paidAtForDate } from '@/lib/invoices/on-paid';

/**
 * Record money the client paid before the Agreement existed — a milestone
 * the proposal marked collected — as an invoice that is already paid.
 *
 * No Stripe invoice and no email: the client isn't being asked for anything,
 * and their signed Agreement already shows the payment as received. The row
 * exists so the money is in the books — Finances reads paid invoices, and
 * the bank reconciliation needs an invoice to match the deposit against.
 * Without it a collected deposit showed up as an unexplained bank deposit.
 *
 * Returns the new invoice id, so the caller can link it to the milestone it
 * paid for.
 */
export async function recordPrepaidInvoice(opts: {
  projectId: string;
  contactId: string;
  amountCents: number;
  description: string;
  /** YYYY-MM-DD the money arrived. */
  paidOn: string;
  method: string;
  /** Who triggered it (the signing client), for the audit trail. */
  actorId: string | null;
}): Promise<string> {
  const paidAt = paidAtForDate(opts.paidOn);
  const { data, error } = await supabaseAdmin()
    .from('invoices')
    .insert({
      project_id: opts.projectId,
      contact_id: opts.contactId,
      stripe_invoice_id: null,
      description: opts.description,
      amount_cents: opts.amountCents,
      status: 'paid',
      due_date: null,
      paid_at: paidAt,
      hosted_invoice_url: null,
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to record prepaid invoice');
  }
  const invoiceId = data.id as string;

  await writeAudit({
    actor_id: opts.actorId,
    action: 'create',
    entity_type: 'invoice',
    entity_id: invoiceId,
    diff: {
      status: 'paid',
      paid_at: paidAt,
      amount_cents: opts.amountCents,
      source: 'collected_before_signing',
      method: opts.method,
    },
  });

  return invoiceId;
}
