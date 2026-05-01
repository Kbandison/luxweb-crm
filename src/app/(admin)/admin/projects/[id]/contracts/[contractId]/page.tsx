import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContract } from '@/lib/queries/admin';
import { ContractBody } from '@/components/contract/contract-body';
import { PrintButton } from '@/components/contract/print-button';
import { formatDateTimeLongTz } from '@/lib/formatters';
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_TONE,
} from '@/lib/status-meta';
import { cn } from '@/lib/utils';

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
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-copper"
          >
            ← Agreement
          </Link>
          <span aria-hidden className="h-3 w-px bg-border" />
          <span
            className={cn(
              'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]',
              CONTRACT_STATUS_TONE[contract.status] ?? 'bg-ink/5 text-ink-muted',
            )}
          >
            {CONTRACT_STATUS_LABEL[contract.status] ?? contract.status}
          </span>
        </div>
        <PrintButton />
      </div>

      {contract.status === 'signed' && contract.signedName ? (
        <section className="rounded-2xl border border-success/30 bg-success/5 p-6">
          <div className="flex items-start gap-4">
            <div
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/15 text-success ring-1 ring-success/25"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-success">
                Signed by {contract.clientName}
              </p>
              <p
                className="mt-1 font-display text-2xl italic tracking-tight text-ink"
                style={{
                  fontFamily:
                    '"Brush Script MT", "Apple Chancery", "Lucida Handwriting", cursive',
                }}
              >
                {contract.signedName}
              </p>
              <dl className="mt-4 grid gap-3 font-mono text-[11px] tabular-nums text-ink-muted sm:grid-cols-3">
                <div>
                  <dt className="uppercase tracking-[0.16em] text-ink-subtle">
                    Signed
                  </dt>
                  <dd className="mt-1 text-ink">
                    {formatDateTimeLongTz(contract.signedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="uppercase tracking-[0.16em] text-ink-subtle">
                    IP address
                  </dt>
                  <dd className="mt-1 break-all text-ink">
                    {contract.signedIp ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="uppercase tracking-[0.16em] text-ink-subtle">
                    User agent
                  </dt>
                  <dd className="mt-1 break-all text-ink">
                    {contract.signedUserAgent ?? '—'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-copper/30 bg-copper-soft/25 p-6">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-copper">
            Awaiting client signature
          </p>
          <p className="mt-1 font-sans text-sm text-ink-muted">
            Body was snapshot at proposal acceptance. The client will sign
            separately from their portal.
          </p>
        </section>
      )}

      <article className="rounded-2xl border border-border bg-surface p-8 md:p-10 print-plain">
        <ContractBody body={contract.bodyMd} />
      </article>
    </main>
  );
}
