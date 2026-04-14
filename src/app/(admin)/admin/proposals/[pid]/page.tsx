import { notFound, redirect } from 'next/navigation';
import { Topbar } from '@/components/admin/topbar';
import { getProposal } from '@/lib/queries/admin';
import { ProposalEditor } from '@/components/admin/proposals/proposal-editor';

/**
 * Canonical admin proposal editor route.
 * If the proposal has a linked project, prefer the project-scoped URL
 * (keeps the project workspace shell + nav context). Otherwise render
 * the standalone editor with a contextual back link to the contact.
 */
export default async function AdminProposalPage({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  const proposal = await getProposal(pid);
  if (!proposal) notFound();

  if (proposal.projectId) {
    redirect(`/admin/projects/${proposal.projectId}/proposals/${proposal.id}`);
  }

  const backHref = proposal.contactId
    ? `/admin/leads?lead=${proposal.contactId}`
    : '/admin/leads';

  return (
    <>
      <Topbar title={proposal.title} />
      <main className="mx-auto w-full max-w-5xl px-8 py-8">
        <ProposalEditor
          proposalId={proposal.id}
          backHref={backHref}
          backLabel="Lead"
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
    </>
  );
}
