import { redirect } from 'next/navigation';
import { getProjectProposals } from '@/lib/queries/admin';
import { ProposalsList } from '@/components/admin/proposals/proposals-list';

export default async function ProjectProposalsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const proposals = await getProjectProposals(id);

  // Single proposal → open the editor directly (per user preference).
  if (proposals.length === 1) {
    redirect(`/admin/projects/${id}/proposals/${proposals[0].id}`);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-8 py-8">
      <ProposalsList projectId={id} initial={proposals} />
    </main>
  );
}
