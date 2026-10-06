import { requireCapability } from '@/lib/auth/guards';
import { executedCopyFilename, loadExecutedCopy } from '@/lib/contracts/after-sign';
import { renderAgreementPdf } from '@/lib/contracts/pdf';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

/** GET /api/admin/contracts/[id]/pdf — the agreement as a PDF, with its audit trail. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCapability('manage_contracts');
    const { id } = await params;
    const copy = await loadExecutedCopy(id);
    if (!copy) return Response.json({ error: 'Not found' }, { status: 404 });
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
    return safeError('admin/contracts/[id]/pdf', err);
  }
}
