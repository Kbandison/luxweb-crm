import 'server-only';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getContactUserId } from '@/lib/notifications';

/**
 * Create + finalize + send an invoice end-to-end. Mirrors the full pipeline
 * used by the admin invoices endpoint so callers (e.g., contract sign,
 * deposit auto-gen) get identical behavior: Stripe customer upsert, draft
 * with explicit line item, finalize + send, crm mirror row, audit row,
 * client notification.
 *
 * Returns the crm invoice id + hosted url. Throws on any failure (caller
 * decides whether to swallow). Stripe-side rollback on mirror failure.
 */
export async function createAndSendInvoice(opts: {
  projectId: string;
  amountCents: number;
  description: string;
  daysUntilDue?: number;
  /** When the call originates from a system event (sign, webhook), null. */
  actorId: string | null;
  /** Tag for the audit diff so we can trace why this invoice was raised. */
  source?: string;
}): Promise<{ invoiceId: string; hostedInvoiceUrl: string | null }> {
  const sb = supabaseAdmin();

  // Pull project + contact so we know who to invoice.
  const { data: project } = await sb
    .from('projects')
    .select('id, contact_id, contacts!inner(full_name, email)')
    .eq('id', opts.projectId)
    .single();
  if (!project) throw new Error('Project not found');

  type Project = {
    contact_id: string;
    contacts:
      | { full_name: string; email: string | null }
      | { full_name: string; email: string | null }[];
  };
  const p = project as unknown as Project;
  const contact = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;

  if (!contact?.email) {
    throw new Error('Contact is missing an email address.');
  }

  const s = stripe();
  const daysUntilDue = opts.daysUntilDue ?? 14;

  // 1. Upsert Stripe customer.
  const existing = await s.customers.list({ email: contact.email, limit: 1 });
  const customer =
    existing.data[0] ??
    (await s.customers.create({
      email: contact.email,
      name: contact.full_name,
      metadata: { contact_id: p.contact_id },
    }));

  // 2. Create draft invoice with no pending items.
  const created = await s.invoices.create({
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: daysUntilDue,
    description: opts.description,
    pending_invoice_items_behavior: 'exclude',
    metadata: {
      project_id: opts.projectId,
      contact_id: p.contact_id,
      ...(opts.source ? { source: opts.source } : {}),
    },
  });
  if (!created.id) throw new Error('Stripe did not return an invoice id');
  const stripeInvoiceId: string = created.id;

  // 3. Attach line item directly to this invoice.
  try {
    await s.invoiceItems.create({
      customer: customer.id,
      invoice: stripeInvoiceId,
      amount: opts.amountCents,
      currency: 'usd',
      description: opts.description,
    });
  } catch (err) {
    try {
      await s.invoices.voidInvoice(stripeInvoiceId);
    } catch {
      /* best effort */
    }
    throw err;
  }

  // 4. Finalize + send.
  const finalized = await s.invoices.finalizeInvoice(stripeInvoiceId);
  await s.invoices.sendInvoice(stripeInvoiceId);

  const dueDate = finalized.due_date
    ? new Date(finalized.due_date * 1000).toISOString().slice(0, 10)
    : null;

  // 5. Mirror.
  const { data, error } = await sb
    .from('invoices')
    .insert({
      project_id: opts.projectId,
      contact_id: p.contact_id,
      stripe_invoice_id: finalized.id,
      description: opts.description,
      amount_cents: opts.amountCents,
      status: 'sent',
      due_date: dueDate,
      hosted_invoice_url: finalized.hosted_invoice_url ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    try {
      await s.invoices.voidInvoice(stripeInvoiceId);
    } catch {
      /* best effort */
    }
    throw new Error(error?.message ?? 'Mirror insert failed');
  }

  const invoiceId = data.id as string;

  await writeAudit({
    actor_id: opts.actorId as unknown as string,
    action: 'send',
    entity_type: 'invoice',
    entity_id: invoiceId,
    diff: {
      stripe_invoice_id: finalized.id,
      amount_cents: opts.amountCents,
      description: opts.description,
      ...(opts.source ? { source: opts.source } : {}),
    },
  });

  // Notify the client.
  const clientUserId = await getContactUserId(p.contact_id);
  if (clientUserId && finalized.hosted_invoice_url) {
    await notify({
      type: 'invoice_sent',
      userId: clientUserId,
      invoiceId,
      description: opts.description,
      amountCents: opts.amountCents,
      dueDate,
      hostedInvoiceUrl: finalized.hosted_invoice_url,
      invoicePath: `/portal/project/${opts.projectId}/invoices`,
    });
  }

  return {
    invoiceId,
    hostedInvoiceUrl: finalized.hosted_invoice_url ?? null,
  };
}
