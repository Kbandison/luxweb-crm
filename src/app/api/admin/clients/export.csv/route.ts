import { requireCapability } from '@/lib/auth/guards';
import { getContactsForExport } from '@/lib/queries/admin';
import { toCsv, csvFilename, csvResponse } from '@/lib/csv';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  try {
    const session = await requireCapability('manage_clients');

    // 60 exports / 60s per admin — generous, but stops an accidental loop.
    const limit = limitByKey(`export:clients:admin:${session.userId}`, {
      capacity: 60,
      refillPerSec: 60 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const url = new URL(req.url);
    const q = url.searchParams.get('q')?.trim() || null;
    const sort = url.searchParams.get('sort') ?? undefined;
    const dir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';

    // `ids` may appear once as comma-joined or repeated. Accept both.
    const rawIds = [
      ...url.searchParams.getAll('ids'),
      ...(url.searchParams.get('ids')?.split(',') ?? []),
    ];
    const ids = Array.from(
      new Set(rawIds.map((s) => s.trim()).filter((s) => UUID_RE.test(s))),
    );

    const rows = await getContactsForExport({
      scope: 'clients',
      q,
      ids: ids.length > 0 ? ids : undefined,
      sort,
      dir,
    });

    const csv = toCsv(
      rows.map((r) => ({
        id: r.id,
        full_name: r.fullName,
        email: r.email ?? '',
        phone: r.phone ?? '',
        company: r.company ?? '',
        tags: r.tags,
        status: 'client',
        created_at: r.createdAt,
      })),
      [
        { key: 'id', header: 'id' },
        { key: 'full_name', header: 'full_name' },
        { key: 'email', header: 'email' },
        { key: 'phone', header: 'phone' },
        { key: 'company', header: 'company' },
        { key: 'tags', header: 'tags' },
        { key: 'status', header: 'status' },
        { key: 'created_at', header: 'created_at' },
      ],
    );

    const filename = csvFilename(ids.length > 0 ? 'clients-selected' : 'clients');
    return csvResponse(csv, filename);
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/clients/export.csv', err);
  }
}
