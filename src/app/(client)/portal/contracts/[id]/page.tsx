import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientContract } from '@/lib/queries/client';
import { ContractBody } from '@/components/contract/contract-body';
import { AgreementSummary } from '@/components/contract/agreement-summary';
import { SignaturePair } from '@/components/contract/signature-block';
import {
  ClientContractActions,
  PrintBar,
} from '@/components/client/contract-actions';
import { SectionHead } from '@/components/ui/section-head';

/**
 * The client's agreement — one page, one signature. A short summary of
 * what's being built, when, and what's paid when; then the full terms
 * they're signing; then the signatures. The studio signed when it sent, so
 * the client's signature executes it and (when there's a deposit) goes
 * straight to paying it.
 */
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

  const pending =
    contract.status === 'pending_client_signature' ||
    contract.status === 'pending_signature';
  // Signing refuses an expired agreement on its own, so the page shouldn't
  // offer to sign one even before the daily expiry job has run.
  const expired =
    pending &&
    (contract.agreementStatus === 'expired' ||
      (contract.expiresAt != null && new Date(contract.expiresAt) <= new Date()));
  const note = contract.content?.note_to_client?.trim();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-10 px-6 py-10 md:px-10 md:py-12">
      <header className="space-y-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
          Agreement · v{contract.agreementVersion.replace(/^v/i, '')}
        </p>
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink md:text-4xl">
          {contract.title}
        </h1>
      </header>

      <div className="print:hidden">
        <ClientContractActions
          contractId={contract.id}
          status={contract.status}
          signedAt={contract.signedAt}
          signedName={contract.signedName}
          expectedSignerName={contract.contactFullName}
          bodySha256={contract.bodySha256}
          expiresAt={contract.expiresAt}
          expired={expired}
        />
      </div>

      {note ? (
        <section className="rounded-2xl border border-copper/20 bg-copper-soft/20 p-6">
          <p className="whitespace-pre-wrap font-sans text-base leading-relaxed text-ink">
            {note}
          </p>
        </section>
      ) : null}

      {contract.content && contract.status !== 'void' ? (
        <AgreementSummary content={contract.content} />
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHead title="The agreement" />
          <div className="flex items-center gap-2 print:hidden">
            {contract.status !== 'void' ? (
              <a
                href={`/api/client/contracts/${contract.id}/pdf`}
                className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-meta text-ink-muted transition-colors hover:border-copper/40 hover:text-copper"
              >
                Download PDF
              </a>
            ) : null}
            {contract.status === 'signed' ? <PrintBar /> : null}
          </div>
        </div>
        <article className="rounded-2xl border border-border bg-surface p-8 md:p-10 print-plain">
          <ContractBody body={contract.bodyMd} />
        </article>
      </section>

      <section className="space-y-4">
        <SectionHead title="Signatures" />
        <SignaturePair
          agreementVersion={contract.agreementVersion}
          adminSignerName={contract.adminSignedName}
          adminSignedAt={contract.adminSignedAt}
          clientName="You"
          clientSignerName={contract.signedName}
          clientSignedAt={contract.signedAt}
        />
        {contract.bodySha256 ? (
          <p className="break-all font-mono text-[10px] text-ink-subtle">
            Document fingerprint (SHA-256): {contract.bodySha256}
          </p>
        ) : null}
      </section>

      {pending && !expired ? (
        <div className="print:hidden">
          <ClientContractActions
            contractId={contract.id}
            status={contract.status}
            signedAt={contract.signedAt}
            signedName={contract.signedName}
            expectedSignerName={contract.contactFullName}
            bodySha256={contract.bodySha256}
            expiresAt={contract.expiresAt}
            expired={expired}
          />
        </div>
      ) : null}
    </main>
  );
}
