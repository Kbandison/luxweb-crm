import { notFound } from 'next/navigation';
import { getContract } from '@/lib/queries/admin';
import { AdminContractView } from '@/components/admin/contracts/admin-contract-view';

export default async function AdminContractPage({
  params,
}: {
  params: Promise<{ id: string; contractId: string }>;
}) {
  const { id: projectId, contractId } = await params;
  const contract = await getContract(contractId);
  if (!contract) notFound();

  return (
    <AdminContractView
      contract={contract}
      backHref={`/admin/projects/${projectId}/agreement`}
      backLabel="Agreement"
    />
  );
}
