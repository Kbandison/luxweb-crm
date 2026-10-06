import { requireClient } from '@/lib/auth/guards';
import { loadChangeOrderCopy } from '@/lib/change-orders/service';
import { renderAgreementPdf } from '@/lib/contracts/pdf';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

/** GET — the client's change order as a PDF (before or after signing). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const { id } = await params;
    const copy = await loadChangeOrderCopy(id);
    if (!copy || copy.clientUserId !== session.userId || copy.status === 'void') {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const pdf = await renderAgreementPdf(copy.pdfInput);
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="luxweb-change-order-${copy.pdfInput.documentLabel.replace(/\D+/g, '')}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('client/change-orders/[id]/pdf', err);
  }
}
