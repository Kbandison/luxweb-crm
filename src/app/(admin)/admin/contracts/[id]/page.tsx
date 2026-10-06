import { notFound, redirect } from 'next/navigation';
import { getContract } from '@/lib/queries/admin';
import { AdminContractView } from '@/components/admin/contracts/admin-contract-view';

/**
 * Standalone contract detail — for contracts that exist before a project
 * does (sent to a lead, not signed yet). Once a project is attached (signing
 * creates or finds one), this redirects to the project-scoped URL so the
 * workspace shell wraps the page properly.
 */
export default async function AdminStandaloneContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) notFound();

  if (contract.projectId) {
    redirect(`/admin/projects/${contract.projectId}/contracts/${id}`);
  }

  return (
    <AdminContractView
      contract={contract}
      backHref={`/admin/proposals/${contract.proposalId}`}
      backLabel="Agreement"
    />
  );
}
