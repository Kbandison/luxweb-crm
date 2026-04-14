import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * POST /api/admin/invoices/[id]/void
 * Voids the invoice in Stripe + mirrors status='void' in crm.invoices.
 * Paid invoices can't be voided (refund flow comes later).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    const { data: row } = await supabaseAdmin()
      .from('invoices')
      .select('stripe_invoice_id, status')
      .eq('id', id)
      .single();

    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if ((row.status as string) === 'paid') {
      return Response.json(
        { error: 'Paid invoices cannot be voided.' },
        { status: 409 },
      );
    }
    if ((row.status as string) === 'void') {
      return Response.json({ ok: true, already: true });
    }

    // Void in Stripe first — only if there's a Stripe invoice id.
    if (row.stripe_invoice_id) {
      try {
        await stripe().invoices.voidInvoice(row.stripe_invoice_id as string);
      } catch (err) {
        // If Stripe refuses (e.g., already voided / unsupported state) log
        // but still mirror the DB so the admin sees it as void.
        const message = err instanceof Error ? err.message : String(err);
        console.warn('Stripe void failed, mirroring anyway:', message);
      }
    }

    const { error } = await supabaseAdmin()
      .from('invoices')
      .update({ status: 'void' })
      .eq('id', id);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'invoice',
      entity_id: id,
      diff: { status: { from: row.status, to: 'void' } },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
