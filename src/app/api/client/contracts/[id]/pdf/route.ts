import { requireClient } from '@/lib/auth/guards';
import { executedCopyFilename, loadExecutedCopy } from '@/lib/contracts/after-sign';
import { renderAgreementPdf } from '@/lib/contracts/pdf';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

/**
 * GET /api/client/contracts/[id]/pdf — the client's agreement as a PDF.
 * Available before signing too, so they can review it offline (or send it
 * to their lawyer); the audit page shows which signatures are in place.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const { id } = await params;
    const copy = await loadExecutedCopy(id);
    if (!copy || copy.clientUserId !== session.userId || copy.status === 'void') {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const pdf = await renderAgreementPdf(copy.pdfInput);
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${executedCopyFilename(copy.title, copy.pdfInput.agreementVersion)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('client/contracts/[id]/pdf', err);
  }
}
