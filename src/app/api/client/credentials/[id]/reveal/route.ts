import { requireClient } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { decryptSecret } from '@/lib/credentials/crypto';
import { getClientCredentialSecret } from '@/lib/queries/client';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();

    // 30 reveals/min per client.
    const limit = limitByKey(`reveal:client:${session.userId}`, {
      capacity: 30,
      refillPerSec: 30 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const { id } = await params;

    const row = await getClientCredentialSecret(id, session.userId);
    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // URL-kind credentials are stored with empty ciphertext (no secret).
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
          { error: 'Failed to decrypt.' },
          { status: 500 },
        );
      }
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'reveal',
      entity_type: 'credential',
      entity_id: id,
      diff: { project_id: row.projectId, by: 'client' },
    });

    return Response.json({ secret });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('client/credentials/[id]/reveal', err);
  }
}
