import { notFound } from 'next/navigation';
import { getProposal } from '@/lib/queries/admin';
import { ProposalEditor } from '@/components/admin/proposals/proposal-editor';

export default async function ProposalEditorPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id, pid } = await params;
  const proposal = await getProposal(pid);
  if (!proposal || proposal.projectId !== id) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl px-8 py-8">
      <ProposalEditor
        proposalId={proposal.id}
        backHref={`/admin/projects/${id}/agreement`}
        backLabel="Agreement"
        initialTitle={proposal.title}
        initialStatus={proposal.status}
        initialContent={proposal.content}
        initialSentAt={proposal.sentAt}
        initialAcceptedAt={proposal.acceptedAt}
        initialAcceptedByName={proposal.acceptedByName}
        initialAcceptedByIp={proposal.acceptedByIp}
        initialAcceptedByUserAgent={proposal.acceptedByUserAgent}
      />
    </main>
  );
}
