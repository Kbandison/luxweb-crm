import { redirect } from 'next/navigation';

// Legacy URL — redirect to the canonical /portal/proposals/[pid].
export default async function ClientProposalPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { pid } = await params;
  redirect(`/portal/proposals/${pid}`);
}
