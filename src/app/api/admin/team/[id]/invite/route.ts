import { requireCapability } from '@/lib/auth/guards';
import { sendStaffInvite } from '@/lib/invites';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/admin/team/[id]/invite — (re)send a branded team-workspace invite.
 * Provisioning the auth user, promoting its role, linking, emailing, and
 * auditing all live in sendStaffInvite(). Requires `manage_team`.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_team');
    const limit = limitByKey(`admin/team/[id]/invite:${session.userId}`, {
      capacity: 30,
      refillPerSec: 30 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    const origin =
      req.headers.get('origin') ??
      process.env.NEXT_PUBLIC_APP_URL ??
      'http://localhost:3000';

    const result = await sendStaffInvite({
      teamMemberId: id,
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
    return safeError('admin/team/[id]/invite', err);
  }
}
