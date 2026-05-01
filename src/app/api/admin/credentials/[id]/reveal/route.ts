import { requireAdmin } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { decryptSecret } from '@/lib/credentials/crypto';
import { getCredentialSecret } from '@/lib/queries/admin';

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    const row = await getCredentialSecret(id);
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
        { error: 'Failed to decrypt — encryption key may be wrong or rotated.' },
        { status: 500 },
      );
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
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
