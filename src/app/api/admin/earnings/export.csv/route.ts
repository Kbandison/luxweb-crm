import { requireAdmin } from '@/lib/auth/guards';
import { getEarningsOverview } from '@/lib/queries/admin';
import { toCsv, csvFilename, csvResponse } from '@/lib/csv';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function GET(_req: Request) {
  try {
    const session = await requireAdmin();

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
        hours: p.hours,
        hourly_rate_cents: p.hourlyRateCents ?? '',
        time_cost_cents: p.costCents,
        invoiced_cents: p.invoicedCents,
        paid_cents: p.paidCents,
        profit_cents: p.profitCents,
      })),
      [
        { key: 'project_id', header: 'project_id' },
        { key: 'project_name', header: 'project_name' },
        { key: 'contact_name', header: 'contact_name' },
        { key: 'hours', header: 'hours' },
        { key: 'hourly_rate_cents', header: 'hourly_rate_cents' },
        { key: 'time_cost_cents', header: 'time_cost_cents' },
        { key: 'invoiced_cents', header: 'invoiced_cents' },
        { key: 'paid_cents', header: 'paid_cents' },
        { key: 'profit_cents', header: 'profit_cents' },
      ],
    );

    // Filename gets a YYYY-MM stamp so multiple month exports stack.
    const now = new Date();
    const yyyyMm = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0')}`;
    void session; // session captured for rate-limit key, unused below
    return csvResponse(csv, csvFilename(`earnings-${yyyyMm}`));
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
