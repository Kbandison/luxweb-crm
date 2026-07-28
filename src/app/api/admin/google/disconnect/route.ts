import { requireAdmin } from '@/lib/auth/guards';
import { disconnectGoogle } from '@/lib/google/calendar';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

/** POST /api/admin/google/disconnect — owner removes their calendar link. */
export async function POST() {
  try {
    const session = await requireAdmin();
    await disconnectGoogle(session.userId);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/google/disconnect', err);
  }
}
