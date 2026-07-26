import { requireCapability } from '@/lib/auth/guards';
import { getEarningsOverview } from '@/lib/queries/admin';
import { toCsv, csvFilename, csvResponse } from '@/lib/csv';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

export async function GET(_req: Request) {
  try {
    const session = await requireCapability('view_finance');

    const limit = limitByKey(`export:earnings:admin:${session.userId}`, {
      capacity: 60,
      refillPerSec: 60 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const overview = await getEarningsOverview();

    const csv = toCsv(
      overview.projects.map((p) => ({
        project_id: p.projectId,
        project_name: p.projectName,
        contact_name: p.contactName,
        invoiced_cents: p.invoicedCents,
        paid_cents: p.paidCents,
      })),
      [
        { key: 'project_id', header: 'project_id' },
        { key: 'project_name', header: 'project_name' },
        { key: 'contact_name', header: 'contact_name' },
        { key: 'invoiced_cents', header: 'invoiced_cents' },
        { key: 'paid_cents', header: 'paid_cents' },
      ],
    );

    const now = new Date();
    const yyyyMm = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0')}`;
    void session;
    return csvResponse(csv, csvFilename(`earnings-${yyyyMm}`));
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/earnings/export.csv', err);
  }
}
