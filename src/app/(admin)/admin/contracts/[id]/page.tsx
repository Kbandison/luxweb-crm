import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getContract } from '@/lib/queries/admin';
import { ContractBody } from '@/components/contract/contract-body';
import { PrintButton } from '@/components/contract/print-button';
import { SignaturePair } from '@/components/contract/signature-block';
import { VoidContractButton } from '@/components/admin/contracts/void-contract-button';
import { StatusPill } from '@/components/ui/status-pill';
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_TONE,
} from '@/lib/status-meta';

/**
 * Standalone contract detail — for contracts that exist before a project
 * does. Once a project is attached (auto-creates on client signature),
 * this redirects to the project-scoped URL so the workspace shell wraps
 * the page properly.
 */
export default async function AdminStandaloneContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) notFound();

  if (contract.projectId) {
    redirect(`/admin/projects/${contract.projectId}/contracts/${id}`);
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/proposals/${contract.proposalId}`}
            className="font-mono text-[10px] uppercase tracking-meta text-ink-muted hover:text-copper"
          >
            ← Proposal
          </Link>
          <span aria-hidden className="h-3 w-px bg-border" />
          <StatusPill
            label={CONTRACT_STATUS_LABEL[contract.status] ?? contract.status}
            tone={CONTRACT_STATUS_TONE[contract.status] ?? 'bg-ink/5 text-ink-muted'}
          />
        </div>
        <div className="flex items-center gap-2">
          {contract.status !== 'void' ? (
            <VoidContractButton contractId={contract.id} />
          ) : null}
          <PrintButton />
        </div>
      </div>

      <article className="rounded-2xl border border-border bg-surface p-8 md:p-10 print-plain">
        <ContractBody body={contract.bodyMd} />
      </article>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-ink-muted">
          Signatures
        </h2>
        <SignaturePair
          agreementVersion={contract.agreementVersion}
          adminSignerName={contract.adminSignedName}
          adminSignedAt={contract.adminSignedAt}
          adminIp={contract.adminSignedIp}
          clientName={contract.clientName}
          clientSignerName={contract.signedName}
          clientSignedAt={contract.signedAt}
          clientIp={contract.signedIp}
        />
      </section>
    </main>
  );
}
