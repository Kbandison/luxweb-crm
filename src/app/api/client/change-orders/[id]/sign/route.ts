import { after } from 'next/server';
import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { notify, getAdminUserIds } from '@/lib/notifications';
import { sendChangeOrderExecutedCopy, signChangeOrder } from '@/lib/change-orders/service';
import { namesMatch } from '@/lib/signatures/match';
import { flattenJoin } from '@/lib/array-join';
import { formatUSD } from '@/lib/formatters';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

const Schema = z.object({
  full_name: z.string().min(2).max(200),
  agreed: z.literal(true),
  body_sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * POST — the client signs a change order. Applied in one transaction
 * (crm.sign_change_order): signature, the added-work milestone or the
 * credit, and the project's budget and dates. Billed-on-signing work is
 * invoiced right after, inside the overcharge guard; the signed PDF goes to
 * both parties after the response.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const limit = limitByKey(`client/change-orders/sign:${session.userId}`, { capacity: 20, refillPerSec: 20 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: 'Type your full name and confirm to sign.' }, { status: 400 });
    }

    const { data } = await supabaseAdmin()
      .from('change_orders')
      .select('id, number, title, status, amount_cents, body_sha256, project_id, contacts!inner(user_id, full_name)')
      .eq('id', id)
      .maybeSingle();
    type Row = {
      number: number;
      title: string;
      status: string;
      amount_cents: number | string;
      body_sha256: string;
      project_id: string;
      contacts: { user_id: string | null; full_name: string } | { user_id: string | null; full_name: string }[];
    };
    const row = data as unknown as Row | null;
    const contact = row ? flattenJoin(row.contacts) : null;
    if (!row || !contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (row.status !== 'sent') {
      return Response.json({ error: 'This change order is no longer open for signing.' }, { status: 409 });
    }
    if (parsed.data.body_sha256 !== row.body_sha256) {
      return Response.json(
        { error: 'The change order changed since this page loaded. Reload before signing.' },
        { status: 409 },
      );
    }
    if (!namesMatch(parsed.data.full_name, contact.full_name)) {
      return Response.json(
        { error: `Signature must match the name on file: ${contact.full_name}.` },
        { status: 422 },
      );
    }

    const signedAt = new Date().toISOString();
    let result: Awaited<ReturnType<typeof signChangeOrder>>;
    try {
      result = await signChangeOrder({
        changeOrderId: id,
        clientUserId: session.userId,
        signature: {
          name: parsed.data.full_name,
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? null,
          userAgent: req.headers.get('user-agent') ?? null,
          signedAt,
        },
      });
    } catch (err) {
      console.error('[change order sign] failed:', err);
      return Response.json(
        { error: "We couldn't record your signature. Nothing was signed — please try again." },
        { status: 500 },
      );
    }
    if (!result.ok) {
      return Response.json({ error: 'This change order is no longer open for signing.' }, { status: 409 });
    }

    const amount = Number(row.amount_cents);
    const adminIds = await getAdminUserIds();
    await Promise.all(
      adminIds.map((userId) =>
        notify({
          type: 'change_order_update',
          kind: 'signed',
          userId,
          changeOrderId: id,
          clientName: contact.full_name,
          number: row.number,
          title: row.title,
          amountCents: amount,
          reason:
            result.ok && result.unappliedCreditCents > 0
              ? `${formatUSD(result.unappliedCreditCents)} of the credit couldn't be applied — every remaining payment is already billed. Settle it by hand.`
              : null,
          path: `/admin/projects/${row.project_id}/change-orders/${id}`,
        }),
      ),
    );
    after(async () => {
      await sendChangeOrderExecutedCopy(id);
    });
    revalidateProject(row.project_id);

    return Response.json({
      ok: true,
      project_id: result.projectId,
      invoice_id: result.invoiceId,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('client/change-orders/[id]/sign', err);
  }
}
