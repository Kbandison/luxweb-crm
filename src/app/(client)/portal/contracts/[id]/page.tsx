import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientContract } from '@/lib/queries/client';
import { ContractBody } from '@/components/contract/contract-body';
import { SignaturePair } from '@/components/contract/signature-block';
import {
  ClientContractActions,
  PrintBar,
} from '@/components/client/contract-actions';

export default async function ClientContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');
  const contract = await getClientContract(id, session.userId);
  if (!contract) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10 md:px-10 md:py-12">
      <div className="print:hidden">
        <ClientContractActions
          contractId={contract.id}
          status={contract.status}
          signedAt={contract.signedAt}
          signedName={contract.signedName}
          expectedSignerName={contract.contactFullName}
        />
      </div>
      <PrintBar />
      <article className="rounded-2xl border border-border bg-surface p-8 md:p-10 print-plain">
        <ContractBody body={contract.bodyMd} />
      </article>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink-muted">
          Signatures
        </h2>
        <SignaturePair
          adminSignerName={contract.adminSignedName}
          adminSignedAt={contract.adminSignedAt}
          clientName="You"
          clientSignerName={contract.signedName}
          clientSignedAt={contract.signedAt}
        />
      </section>
    </main>
  );
}
