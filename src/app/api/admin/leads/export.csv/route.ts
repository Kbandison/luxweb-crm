import { requireCapability } from '@/lib/auth/guards';
import {
  getContactsForExport,
  getLeadInquiriesByContactId,
} from '@/lib/queries/admin';
import { toCsv, csvFilename, csvResponse } from '@/lib/csv';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  try {
    const session = await requireCapability('manage_leads');

    const limit = limitByKey(`export:leads:admin:${session.userId}`, {
      capacity: 60,
      refillPerSec: 60 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const url = new URL(req.url);
    const q = url.searchParams.get('q')?.trim() || null;
    const sort = url.searchParams.get('sort') ?? undefined;
    const dir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';

    const rawIds = [
      ...url.searchParams.getAll('ids'),
      ...(url.searchParams.get('ids')?.split(',') ?? []),
    ];
    const ids = Array.from(
      new Set(rawIds.map((s) => s.trim()).filter((s) => UUID_RE.test(s))),
    );

    const rows = await getContactsForExport({
      scope: 'leads',
      q,
      ids: ids.length > 0 ? ids : undefined,
      sort,
      dir,
    });

    // The "message" column = earliest contact note (the original inquiry).
    // Pulled once for the whole batch rather than per row.
    const inquiries = await getLeadInquiriesByContactId(rows.map((r) => r.id));

    const csv = toCsv(
      rows.map((r) => ({
        id: r.id,
        full_name: r.fullName,
        email: r.email ?? '',
        company: r.company ?? '',
        source: r.source ?? '',
        lead_score: r.leadScore,
        tags: r.tags,
        created_at: r.createdAt,
        message: inquiries.get(r.id) ?? '',
      })),
      [
        { key: 'id', header: 'id' },
        { key: 'full_name', header: 'full_name' },
        { key: 'email', header: 'email' },
        { key: 'company', header: 'company' },
        { key: 'source', header: 'source' },
        { key: 'lead_score', header: 'lead_score' },
        { key: 'tags', header: 'tags' },
        { key: 'created_at', header: 'created_at' },
        { key: 'message', header: 'message' },
      ],
    );

    const filename = csvFilename(ids.length > 0 ? 'leads-selected' : 'leads');
    return csvResponse(csv, filename);
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/leads/export.csv', err);
  }
}
