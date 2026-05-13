import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContract } from '@/lib/queries/admin';
import { ContractBody } from '@/components/contract/contract-body';
import { PrintButton } from '@/components/contract/print-button';
import { SignaturePair } from '@/components/contract/signature-block';
import { StatusPill } from '@/components/ui/status-pill';
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_TONE,
} from '@/lib/status-meta';

export default async function AdminContractPage({
  params,
}: {
  params: Promise<{ id: string; contractId: string }>;
}) {
  const { id: projectId, contractId } = await params;
  const contract = await getContract(contractId);
  if (!contract) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/projects/${projectId}/agreement`}
            className="font-mono text-[10px] uppercase tracking-meta text-ink-muted hover:text-copper"
          >
            ← Agreement
          </Link>
          <span aria-hidden className="h-3 w-px bg-border" />
          <StatusPill
            label={CONTRACT_STATUS_LABEL[contract.status] ?? contract.status}
            tone={CONTRACT_STATUS_TONE[contract.status] ?? 'bg-ink/5 text-ink-muted'}
          />
        </div>
        <PrintButton />
      </div>

      <article className="rounded-2xl border border-border bg-surface p-8 md:p-10 print-plain">
        <ContractBody body={contract.bodyMd} />
      </article>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-ink-muted">
          Signatures
        </h2>
        <SignaturePair
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
