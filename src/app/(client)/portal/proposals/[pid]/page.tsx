import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientProposalById } from '@/lib/queries/client';
import { ProposalPreview } from '@/components/admin/proposals/proposal-preview';
import {
  ClientProposalActions,
  PrintBar,
} from '@/components/client/proposal-actions';

/**
 * Canonical portal proposal view. Works for proposals attached directly
 * to the viewer's contact (pre-project leads) as well as project-scoped
 * ones. Ownership verified via contacts.user_id.
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

  return (
    <main className="mx-auto w-full max-w-5xl space-y-10 px-6 py-10 md:px-10 md:py-12">
      <div className="print:hidden">
        <ClientProposalActions
          proposalId={proposal.id}
          status={proposal.status}
          acceptedAt={proposal.acceptedAt}
        />
      </div>
      <PrintBar />
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
