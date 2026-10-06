import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import {
  getClientProposalById,
  getLiveContractIdForProposal,
} from '@/lib/queries/client';
import { ProposalPreview } from '@/components/admin/proposals/proposal-preview';
import {
  ClientProposalActions,
  PrintBar,
} from '@/components/client/proposal-actions';

/**
 * An agreement link. Agreements are reviewed and signed on their contract
 * page, so this forwards there whenever one is live. What's left to render
 * here is history: an agreement that was declined, expired, or withdrawn,
 * and older proposals from before the one-signature flow.
 */
export default async function PortalProposalPage({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  const proposal = await getClientProposalById(pid, session.userId);
  if (!proposal) notFound();

  const liveContractId = await getLiveContractIdForProposal(pid, session.userId);
  if (liveContractId) redirect(`/portal/contracts/${liveContractId}`);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-10 px-6 py-10 md:px-10 md:py-12">
      <div className="print:hidden">
        <ClientProposalActions
          status={proposal.status}
          acceptedAt={proposal.acceptedAt}
        />
      </div>
      {proposal.status === 'accepted' ? <PrintBar /> : null}
      <ProposalPreview
        title={proposal.title}
        content={proposal.content}
        signature={
          proposal.status === 'accepted'
            ? {
                acceptedAt: proposal.acceptedAt,
                acceptedByName: proposal.acceptedByName,
                acceptedByIp: proposal.acceptedByIp,
                acceptedByUserAgent: proposal.acceptedByUserAgent,
              }
            : undefined
        }
      />
    </main>
  );
}
