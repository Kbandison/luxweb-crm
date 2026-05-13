import { requireAdmin } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { decryptSecret } from '@/lib/credentials/crypto';
import { getCredentialSecret } from '@/lib/queries/admin';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();

    // 30 reveals/min per admin. Stops a runaway script from siphoning
    // every secret in the DB at once.
    const limit = limitByKey(`reveal:admin:${session.userId}`, {
      capacity: 30,
      refillPerSec: 30 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const { id } = await params;

    const row = await getCredentialSecret(id);
    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // URL-kind credentials are stored with empty ciphertext (no secret
    // to mask). Short-circuit to avoid trying to decrypt empty input.
    let secret: string;
    if (!row.ciphertext) {
      secret = '';
    } else {
      try {
        secret = decryptSecret({
          ciphertext: row.ciphertext,
          iv: row.iv,
          tag: row.tag,
        });
      } catch {
        return Response.json(
          { error: 'Failed to decrypt — encryption key may be wrong or rotated.' },
          { status: 500 },
        );
      }
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'reveal',
      entity_type: 'credential',
      entity_id: id,
      diff: { project_id: row.projectId },
    });

    return Response.json({ secret });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/credentials/[id]/reveal', err);
  }
}
