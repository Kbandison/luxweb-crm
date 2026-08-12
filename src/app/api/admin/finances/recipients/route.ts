import { requireCapability } from '@/lib/auth/guards';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { listRecipients, paymentsEnabled } from '@/lib/mercury/payments';

export const runtime = 'nodejs';

/**
 * GET /api/admin/finances/recipients — payees already set up in Mercury.
 *
 * Read-through, not mirrored: a recipient carries bank account and routing
 * numbers, and none of that belongs in the CRM's database. Only the id, a
 * display name, and the default method are returned to the browser.
 */
export async function GET() {
  try {
    const session = await requireCapability('manage_billing');
    if (!paymentsEnabled()) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const limit = limitByKey(`finances/recipients:${session.userId}`, {
      capacity: 30,
      refillPerSec: 0.5,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const recipients = await listRecipients();
    return Response.json({
      recipients: recipients.map((r) => ({
        id: r.id,
        name: r.nickname || r.name,
        defaultPaymentMethod: r.defaultPaymentMethod,
        lastPaid: r.dateLastPaid,
      })),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/finances/recipients', err);
  }
}
