import Link from 'next/link';
import type { ContractDetail } from '@/lib/queries/admin';
import { ContractBody } from '@/components/contract/contract-body';
import { PrintButton } from '@/components/contract/print-button';
import { SignaturePair } from '@/components/contract/signature-block';
import { VoidContractButton } from '@/components/admin/contracts/void-contract-button';
import { FinishSetupButton } from '@/components/admin/contracts/finish-setup-button';
import { StatusPill } from '@/components/ui/status-pill';
import { formatDate, formatDateTime } from '@/lib/formatters';
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUS_TONE } from '@/lib/status-meta';

const DEPOSIT_LABEL: Record<string, string> = {
  not_required: 'No deposit',
  collected: 'Deposit received before signing',
  pending: 'Deposit invoice not raised yet',
  running: 'Raising deposit invoice…',
  invoiced: 'Deposit invoiced',
  failed: 'Deposit invoice failed',
};

/**
 * One contract, as the studio sees it: status and what's still outstanding
 * after signing, the frozen agreement, and both signatures. Shared by the
 * project-scoped and standalone contract pages.
 */
export function AdminContractView({
  contract,
  backHref,
  backLabel,
}: {
  contract: ContractDetail;
  backHref: string;
  backLabel: string;
}) {
  const signed = contract.status === 'signed';
  const pending =
    contract.status === 'pending_client_signature' ||
    contract.status === 'pending_signature';
  // Only agreements signed under the one-signature flow track follow-up
  // (they're the ones with a fingerprint); older contracts have nothing to finish.
  const tracksSetup = signed && contract.bodySha256 != null;
  const depositStuck =
    contract.depositState === 'pending' ||
    contract.depositState === 'failed' ||
    contract.depositState === 'running';
  const copyMissing = tracksSetup && !contract.executedCopySentAt;
  const needsAttention = tracksSetup && (depositStuck || copyMissing);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="font-mono text-[10px] uppercase tracking-meta text-ink-muted hover:text-copper"
          >
            ← {backLabel}
          </Link>
          <span aria-hidden className="h-3 w-px bg-border" />
          <StatusPill
            label={CONTRACT_STATUS_LABEL[contract.status] ?? contract.status}
            tone={CONTRACT_STATUS_TONE[contract.status] ?? 'bg-ink/5 text-ink-muted'}
          />
          {pending && contract.expiresAt ? (
            <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
              Open until {formatDate(contract.expiresAt)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {contract.status !== 'void' ? (
            <VoidContractButton contractId={contract.id} />
          ) : null}
          <a
            href={`/api/admin/contracts/${contract.id}/pdf`}
            className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-meta text-ink-muted transition-colors hover:border-copper/40 hover:text-copper"
          >
            Download PDF
          </a>
          <PrintButton />
        </div>
      </div>

      {contract.status === 'void' ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-3">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-ink-muted">
            Voided{contract.voidedAt ? ` ${formatDateTime(contract.voidedAt)}` : ''}
          </p>
          {contract.voidReason ? (
            <p className="mt-0.5 font-sans text-sm text-ink">{contract.voidReason}</p>
          ) : null}
        </div>
      ) : null}

      {needsAttention ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 px-5 py-3 print:hidden">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-danger">
              Signed — setup didn&apos;t finish
            </p>
            <ul className="mt-1 space-y-0.5 font-sans text-xs text-ink">
              {depositStuck ? (
                <li>
                  {DEPOSIT_LABEL[contract.depositState ?? ''] ?? contract.depositState}
                  {contract.depositError ? (
                    <span className="block font-mono text-[11px] text-ink-muted">
                      {contract.depositError}
                    </span>
                  ) : null}
                </li>
              ) : null}
              {copyMissing ? <li>Signed copy not emailed yet</li> : null}
            </ul>
          </div>
          <FinishSetupButton contractId={contract.id} />
        </div>
      ) : tracksSetup ? (
        <p className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle print:hidden">
          {DEPOSIT_LABEL[contract.depositState ?? ''] ?? 'Deposit —'} · signed copy
          emailed {contract.executedCopySentAt ? formatDateTime(contract.executedCopySentAt) : ''}
        </p>
      ) : null}

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
        {contract.bodySha256 ? (
          <p className="break-all font-mono text-[10px] text-ink-subtle">
            Document fingerprint (SHA-256): {contract.bodySha256}
          </p>
        ) : null}
      </section>
    </main>
  );
}
