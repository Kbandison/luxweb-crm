import { requireAdmin } from '@/lib/auth/guards';
import { sendPortalInvite } from '@/lib/invites';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/admin/contacts/[id]/invite
 *
 * Manually (re)send a branded portal invite to a contact. The actual work —
 * provisioning the auth user, building the token_hash link, self-healing the
 * contact link, emailing, auditing — lives in sendPortalInvite() so the
 * proposal-send auto-invite can reuse it.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const limit = limitByKey(
      `admin/contacts/[id]/invite:${session.userId}`,
      { capacity: 60, refillPerSec: 60 / 60 },
    );
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    const origin =
      req.headers.get('origin') ??
      process.env.NEXT_PUBLIC_APP_URL ??
      'http://localhost:3000';

    const result = await sendPortalInvite({
      contactId: id,
      origin,
      actorId: session.userId,
    });
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json({
      ok: true,
      user_id: result.userId,
      resend: result.resend,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/contacts/[id]/invite', err);
  }
}
