import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { closeMilestoneForInvoice } from '@/lib/milestones/advance-on-payment';
import {
  notify,
  getAdminUserIds,
  getContactName,
  getContactUserId,
} from '@/lib/notifications';

/**
 * Flip an invoice to paid — exactly once. Returns true only for the caller
 * whose update actually did it.
 *
 * Three paths can learn about the same payment: the Stripe webhook, the
 * client landing back on the portal after paying (reconcile), and an admin
 * recording an off-Stripe payment (which itself makes Stripe fire the
 * webhook). Each used to read the status, then write unconditionally, so two
 * of them racing would both "win": two milestones closed, two receipts sent,
 * and the webhook stamping today over an admin's backdated paid date.
 *
 * Making the write conditional on the row not already being paid turns that
 * into a single winner, and only the winner runs side effects.
 *
 * `fromVoid` lets the Stripe webhook record money against a row the CRM
 * thinks is void — Stripe is the source of truth for whether money moved.
 * The admin and client paths refuse void invoices before getting here.
 */
export async function claimInvoicePaid(
  invoiceId: string,
  paidAt: string,
  opts: { fromVoid?: boolean } = {},
): Promise<boolean> {
  const excluded = opts.fromVoid ? '("paid")' : '("paid","void")';
  const { data, error } = await supabaseAdmin()
    .from('invoices')
    .update({ status: 'paid', paid_at: paidAt })
    .eq('id', invoiceId)
    .not('status', 'in', excluded)
    .select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/**
 * Undo a claim when the step that had to follow it failed (mark-paid's
 * Stripe settle). Only reverts a row this claim wrote — matched on paid_at —
 * so it can't clobber a genuine payment that landed in between.
 */
export async function releaseInvoicePaid(
  invoiceId: string,
  paidAt: string,
  previousStatus: string,
): Promise<void> {
  await supabaseAdmin()
    .from('invoices')
    .update({ status: previousStatus, paid_at: null })
    .eq('id', invoiceId)
    .eq('status', 'paid')
    .eq('paid_at', paidAt);
}

/**
 * Everything a payment moves forward, shared by every path that can record
 * one so they leave the system in the same state:
 *
 *   - the contact's deal → active
 *   - the project planning → in_progress (first payment starts the work)
 *   - the milestone this invoice was for → done, next one unlocked
 *
 * Notifications stay with the callers — the webhook, the portal return, and
 * an admin recording a check each tell different people different things.
 * Best-effort throughout: the money is already recorded.
 */
export async function applyInvoicePaidEffects(invoice: {
  id: string;
  contactId: string;
  projectId: string | null;
  amountCents: number;
  description: string | null;
}): Promise<void> {
  const sb = supabaseAdmin();

  try {
    await sb
      .from('deals')
      .update({ stage: 'active', stage_changed_at: new Date().toISOString() })
      .eq('contact_id', invoice.contactId)
      .in('stage', ['lead', 'discovery', 'proposal']);
  } catch {
    // Best-effort.
  }

  if (!invoice.projectId) return;

  try {
    await sb
      .from('projects')
      .update({ status: 'in_progress' })
      .eq('id', invoice.projectId)
      .eq('status', 'planning');
  } catch {
    // Best-effort.
  }

  await closeMilestoneForInvoice(invoice.projectId, {
    id: invoice.id,
    amountCents: invoice.amountCents,
    description: invoice.description,
  });
}

/**
 * Tell both sides a client paid through Stripe: the client's receipt, and the
 * studio's "you got paid" alert. Called by whichever path claimed the
 * payment — the webhook or the client's return to the portal. Before this
 * was shared, a client who landed back first claimed the payment silently
 * and neither email ever went out.
 *
 * Not used by an admin's Mark paid: that sends the client a receipt but
 * skips the studio alert, since the studio just recorded it by hand.
 */
export async function notifyInvoicePaid(invoice: {
  invoiceId: string;
  contactId: string;
  projectId: string | null;
  description: string;
  amountCents: number;
  paidAt: string;
  hostedInvoiceUrl: string | null;
}): Promise<void> {
  const { invoiceId, contactId, projectId, description, amountCents } = invoice;

  const clientUserId = await getContactUserId(contactId);
  if (clientUserId) {
    await notify({
      type: 'invoice_paid',
      userId: clientUserId,
      invoiceId,
      description,
      amountCents,
      paidAt: invoice.paidAt,
      hostedInvoiceUrl: invoice.hostedInvoiceUrl,
      invoicePath: projectId
        ? `/portal/project/${projectId}/invoices`
        : '/portal/dashboard',
    });
  }

  // Admin fan-out: in-app bell + email to the studio inbox (alerts@).
  const clientName = await getContactName(contactId);
  const adminIds = await getAdminUserIds();
  if (adminIds.length > 0) {
    const adminInvoicePath = projectId
      ? `/admin/projects/${projectId}/invoices`
      : '/admin/dashboard';
    await Promise.all(
      adminIds.map((userId) =>
        notify({
          type: 'payment_received',
          userId,
          invoiceId,
          clientName,
          description,
          amountCents,
          invoicePath: adminInvoicePath,
        }),
      ),
    );
  }
}

export { paidAtForDate } from '@/lib/invoices/paid-at';
