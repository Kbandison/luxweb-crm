import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { getUserFullName } from '@/lib/queries/admin';
import { createAndSendChangeOrder } from '@/lib/change-orders/service';
import { DraftSchema, toDraft } from '@/lib/change-orders/schema';
import { namesMatch } from '@/lib/signatures/match';
import { DEFAULT_EXPIRY_DAYS } from '@/lib/agreements/expiry';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

const Schema = z.object({
  draft: DraftSchema,
  full_name: z.string().min(2).max(200),
  agreed: z.literal(true),
  expires_in_days: z.number().int().min(1).max(90).optional(),
});

/**
 * POST — sign & send a change order against a signed agreement (§ 1.5).
 * The studio signs now; the client signs once from their portal.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_contracts');
    const limit = limitByKey(`admin/change-orders/send:${session.userId}`, { capacity: 20, refillPerSec: 20 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? 'Fill in the change order, then sign.' },
        { status: 400 },
      );
    }

    const senderName = await getUserFullName(session.userId);
    if (!namesMatch(parsed.data.full_name, senderName)) {
      return Response.json(
        {
          error: senderName
            ? `Signature must match your name on file: ${senderName}.`
            : 'No full name on your account. Add it to your profile before signing.',
        },
        { status: 422 },
      );
    }

    const result = await createAndSendChangeOrder({
      contractId: id,
      draft: toDraft(parsed.data.draft),
      sender: {
        userId: session.userId,
        name: parsed.data.full_name,
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? null,
        userAgent: req.headers.get('user-agent') ?? null,
      },
      expiresInDays: parsed.data.expires_in_days ?? DEFAULT_EXPIRY_DAYS,
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
    revalidateProject(result.projectId);
    return Response.json({ ok: true, id: result.id, number: result.number, project_id: result.projectId });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/contracts/[id]/change-orders', err);
  }
}
