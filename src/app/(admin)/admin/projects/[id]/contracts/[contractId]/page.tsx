import { notFound } from 'next/navigation';
import { getContract } from '@/lib/queries/admin';
import { getChangeOrdersForContract } from '@/lib/queries/change-orders';
import { AdminContractView } from '@/components/admin/contracts/admin-contract-view';

export default async function AdminContractPage({
  params,
}: {
  params: Promise<{ id: string; contractId: string }>;
}) {
  const { id: projectId, contractId } = await params;
  const [contract, changeOrders] = await Promise.all([
    getContract(contractId),
    getChangeOrdersForContract(contractId),
  ]);
  if (!contract) notFound();

  return (
    <AdminContractView
      contract={contract}
      backHref={`/admin/projects/${projectId}/agreement`}
      backLabel="Agreement"
      changeOrders={changeOrders}
    />
  );
}
