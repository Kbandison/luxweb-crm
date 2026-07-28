import { requireCapability } from '@/lib/auth/guards';
import { getProspects } from '@/lib/queries/outreach';
import { STATUS_LABEL } from '@/lib/outreach/meta';
import { toCsv, csvFilename, csvResponse } from '@/lib/csv';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

/**
 * GET /api/outreach/prospects/export.csv — export the call list. A setter gets
 * their own; owner/manager get all (or ?setter=<id>).
 */
export async function GET(req: Request) {
  try {
    const session = await requireCapability('manage_outreach');
    const limit = limitByKey(`export:outreach:${session.userId}`, {
      capacity: 30,
      refillPerSec: 30 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const setterParam = new URL(req.url).searchParams.get('setter') || undefined;
    const setterId = session.role === 'setter' ? session.userId : setterParam;

    const rows = await getProspects({ setterId });
    const csv = toCsv(
      rows.map((r) => ({
        contact_name: r.fullName,
        business: r.company ?? '',
        phone: r.phone ?? '',
        email: r.email ?? '',
        industry: r.industry ?? '',
        website_problem: r.websiteProblem ?? '',
        source: r.source ?? '',
        status: STATUS_LABEL[r.status],
        attempts: r.attempts,
        last_contacted: r.lastContactedAt ?? '',
        next_action: r.nextAction ?? '',
        next_action_date: r.nextActionAt ?? '',
        notes: r.notes ?? '',
        setter: r.ownerName ?? '',
      })),
      [
        { key: 'contact_name', header: 'Contact Name' },
        { key: 'business', header: 'Business' },
        { key: 'phone', header: 'Phone' },
        { key: 'email', header: 'Email' },
        { key: 'industry', header: 'Industry' },
        { key: 'website_problem', header: 'Website Problem' },
        { key: 'source', header: 'Source' },
        { key: 'status', header: 'Status' },
        { key: 'attempts', header: 'Attempts' },
        { key: 'last_contacted', header: 'Last Contacted' },
        { key: 'next_action', header: 'Next Action' },
        { key: 'next_action_date', header: 'Next Action Date' },
        { key: 'notes', header: 'Notes' },
        { key: 'setter', header: 'Setter' },
      ],
    );

    return csvResponse(csv, csvFilename('call-list'));
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/prospects/export.csv', err);
  }
}
