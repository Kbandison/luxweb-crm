import { requireClient } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { decryptSecret } from '@/lib/credentials/crypto';
import { getClientCredentialSecret } from '@/lib/queries/client';

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const { id } = await params;

    const row = await getClientCredentialSecret(id, session.userId);
    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    let secret: string;
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
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
