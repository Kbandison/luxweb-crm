import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { writeAudit } from '@/lib/audit';
import { notify, getContactUserId } from '@/lib/notifications';

export const runtime = 'nodejs';

const CreateSchema = z.object({
  project_id: z.string().uuid(),
  amount_cents: z.number().int().min(100), // $1 minimum
  description: z.string().min(1).max(500),
  days_until_due: z.number().int().min(1).max(365).default(14),
});

export async function POST(req: Request) {
  try {
    const session = await requireAdmin();
    const raw = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Pull project + contact so we know who to invoice.
    const { data: project } = await supabaseAdmin()
      .from('projects')
      .select(
        'id, contact_id, contacts!inner(full_name, email)',
      )
      .eq('id', parsed.data.project_id)
      .single();

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    type Project = {
      contact_id: string;
      contacts:
        | { full_name: string; email: string | null }
        | { full_name: string; email: string | null }[];
    };
    const p = project as unknown as Project;
    const contact = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;

    if (!contact?.email) {
      return Response.json(
        {
          error:
            'Contact is missing an email address. Add one to the client record before invoicing.',
        },
        { status: 400 },
      );
    }

    const s = stripe();

    // 1. Upsert Stripe customer (match by email — Stripe allows dupes otherwise).
    const existing = await s.customers.list({ email: contact.email, limit: 1 });
    const customer =
      existing.data[0] ??
      (await s.customers.create({
        email: contact.email,
        name: contact.full_name,
        metadata: { contact_id: p.contact_id },
      }));

    // 2. Create the invoice FIRST as a draft with no pending items. We'll
    //    attach the line item explicitly in step 3 — this way we can't pick
    //    up stray items from earlier failed runs, and we can't end up with
    //    a $0 invoice because the item went to a different invoice.
    const created = await s.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: parsed.data.days_until_due,
      description: parsed.data.description,
      pending_invoice_items_behavior: 'exclude',
      metadata: {
        project_id: parsed.data.project_id,
        contact_id: p.contact_id,
      },
    });

    if (!created.id) {
      return Response.json(
        { error: 'Stripe did not return an invoice id' },
        { status: 500 },
      );
    }
    const stripeInvoiceId: string = created.id;

    // 3. Attach the line item directly to THIS invoice (not the customer's
    //    pending queue). Rolls back the draft on failure so we never ship
    //    a zero-dollar invoice.
    try {
      await s.invoiceItems.create({
        customer: customer.id,
        invoice: stripeInvoiceId,
        amount: parsed.data.amount_cents,
        currency: 'usd',
        description: parsed.data.description,
      });
    } catch (err) {
      try {
        await s.invoices.voidInvoice(stripeInvoiceId);
      } catch {
        /* best effort */
      }
      const message = err instanceof Error ? err.message : 'Invoice item failed';
      return Response.json({ error: message }, { status: 500 });
    }

    // 4. Finalize + send.
    const finalized = await s.invoices.finalizeInvoice(stripeInvoiceId);
    await s.invoices.sendInvoice(stripeInvoiceId);

    // 5. Mirror into crm.invoices.
    const dueDate = finalized.due_date
      ? new Date(finalized.due_date * 1000).toISOString().slice(0, 10)
      : null;

    const { data, error } = await supabaseAdmin()
      .from('invoices')
      .insert({
        project_id: parsed.data.project_id,
        contact_id: p.contact_id,
        stripe_invoice_id: finalized.id,
        description: parsed.data.description,
        amount_cents: parsed.data.amount_cents,
        status: 'sent',
        due_date: dueDate,
        hosted_invoice_url: finalized.hosted_invoice_url ?? null,
      })
      .select('id')
      .single();

    if (error || !data) {
      // Roll back the Stripe invoice so we don't leave an orphan live invoice
      // that the client could pay while we never know about it.
      try {
        await s.invoices.voidInvoice(stripeInvoiceId);
      } catch (voidErr) {
        console.warn(
          '[invoices/create] mirror insert failed + void failed:',
          voidErr,
        );
      }
      return Response.json(
        { error: error?.message ?? 'Mirror insert failed' },
        { status: 500 },
      );
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'send',
      entity_type: 'invoice',
      entity_id: data.id as string,
      diff: {
        stripe_invoice_id: finalized.id,
        amount_cents: parsed.data.amount_cents,
        description: parsed.data.description,
      },
    });

    // Notify the client (if they've been invited to the portal).
    const clientUserId = await getContactUserId(p.contact_id);
    if (clientUserId && finalized.hosted_invoice_url) {
      await notify({
        type: 'invoice_sent',
        userId: clientUserId,
        invoiceId: data.id as string,
        description: parsed.data.description,
        amountCents: parsed.data.amount_cents,
        dueDate:
          finalized.due_date
            ? new Date(finalized.due_date * 1000).toISOString().slice(0, 10)
            : null,
        hostedInvoiceUrl: finalized.hosted_invoice_url,
        invoicePath: `/portal/project/${parsed.data.project_id}/invoices`,
      });
    }

    return Response.json({
      id: data.id,
      stripe_invoice_id: finalized.id,
      hosted_invoice_url: finalized.hosted_invoice_url ?? null,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: message }, { status: 500 });
  }
}
