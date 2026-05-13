import { getProjectInvoices } from '@/lib/queries/admin';
import { InvoicesList } from '@/components/admin/invoices/invoices-list';

export default async function ProjectInvoicesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoices = await getProjectInvoices(id);

  // Tool tab — no max-width per workspace rule (files/milestones/time/messages/invoices).
  return (
    <main className="w-full px-8 py-8">
      <InvoicesList projectId={id} initial={invoices} />
    </main>
  );
}
