import { notFound } from 'next/navigation';
import {
  getContractByProposalId,
  getProposal,
  getUserFullName,
} from '@/lib/queries/admin';
import { getSession } from '@/lib/supabase/session';
import { ProposalEditor } from '@/components/admin/proposals/proposal-editor';

export default async function ProposalEditorPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id, pid } = await params;
  const session = await getSession();
  const [proposal, existingContract, senderName] = await Promise.all([
    getProposal(pid),
    getContractByProposalId(pid),
    session ? getUserFullName(session.userId) : Promise.resolve(null),
  ]);
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
        initialRevision={proposal.revision}
        initialAcceptedAt={proposal.acceptedAt}
        existingContract={existingContract}
        senderName={senderName}
        initialExpiresAt={proposal.expiresAt}
      />
    </main>
  );
}
