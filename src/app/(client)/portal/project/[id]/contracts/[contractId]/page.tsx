import { redirect } from 'next/navigation';

export default async function LegacyClientContractPage({
  params,
}: {
  params: Promise<{ id: string; contractId: string }>;
}) {
  const { contractId } = await params;
  redirect(`/portal/contracts/${contractId}`);
}
