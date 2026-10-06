import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getChangeOrder, CHANGE_ORDER_STATUS_META } from '@/lib/queries/change-orders';
import { ContractBody } from '@/components/contract/contract-body';
import { SignaturePair } from '@/components/contract/signature-block';
import { StatusPill } from '@/components/ui/status-pill';
import { FinishSetupButton } from '@/components/admin/contracts/finish-setup-button';
import { WithdrawChangeOrderButton } from '@/components/admin/change-orders/withdraw-change-order-button';
import { CURRENT_AGREEMENT_VERSION } from '@/lib/contracts/versions';
import { formatDate, formatDateTime, formatUSD } from '@/lib/formatters';

function priceSummary(amountCents: number, billing: string): string {
  if (amountCents > 0) {
    return `Adds ${formatUSD(amountCents)} · billed ${billing === 'on_signing' ? 'on signing' : 'when the work is approved'}`;
  }
  if (amountCents < 0) return `Credit of ${formatUSD(-amountCents)}`;
  return 'No price change';
}

export default async function AdminChangeOrderPage({
  params,
}: {
  params: Promise<{ id: string; coId: string }>;
}) {
  const { id: projectId, coId } = await params;
  const co = await getChangeOrder(coId);
  if (!co || co.projectId !== projectId) notFound();

  const meta = CHANGE_ORDER_STATUS_META[co.status];
  const signed = co.status === 'signed';
  const invoiceStuck = signed && ['pending', 'failed', 'running'].includes(co.invoiceState);
  const copyMissing = signed && !co.executedCopySentAt;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/projects/${projectId}/contracts/${co.contractId}`}
            className="font-mono text-[10px] uppercase tracking-meta text-ink-muted hover:text-copper"
          >
            ← Agreement
          </Link>
          <span aria-hidden className="h-3 w-px bg-border" />
          <StatusPill label={meta.label} tone={meta.tone} />
          {co.status === 'sent' && co.expiresAt ? (
            <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
              Open until {formatDate(co.expiresAt)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {co.status === 'sent' ? <WithdrawChangeOrderButton changeOrderId={co.id} /> : null}
          <a
            href={`/api/admin/change-orders/${co.id}/pdf`}
            className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-meta text-ink-muted transition-colors hover:border-copper/40 hover:text-copper"
          >
            Download PDF
          </a>
        </div>
      </div>

      <header className="space-y-1">
        <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
          Change order #{co.number} · {co.clientName}
        </p>
        <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{co.title}</h1>
        <p className="font-sans text-sm text-ink-muted">
          {priceSummary(co.amountCents, co.billing)}
          {co.timelineWeeks !== 0
            ? ` · ${co.timelineWeeks > 0 ? '+' : ''}${co.timelineWeeks} ${Math.abs(co.timelineWeeks) === 1 ? 'week' : 'weeks'}`
            : ''}
        </p>
      </header>

      {co.status === 'declined' ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-5 py-3">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-danger">
            Declined {co.declinedAt ? formatDateTime(co.declinedAt) : ''}
          </p>
          {co.declineReason ? (
            <p className="mt-0.5 whitespace-pre-wrap font-sans text-sm text-ink">{co.declineReason}</p>
          ) : null}
        </div>
      ) : null}
      {co.status === 'void' && co.voidReason ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-3">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-ink-muted">
            Withdrawn
          </p>
          <p className="mt-0.5 font-sans text-sm text-ink">{co.voidReason}</p>
        </div>
      ) : null}

      {signed && co.amountCents < 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-3">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta text-ink-muted">
            Credit applied
          </p>
          <ul className="mt-1 space-y-0.5 font-sans text-sm text-ink">
            {co.creditApplied.map((line) => (
              <li key={line.milestone_id}>
                {formatUSD(line.from_cents)} → {formatUSD(line.to_cents)}
              </li>
            ))}
          </ul>
          {co.creditUnappliedCents > 0 ? (
            <p className="mt-2 font-sans text-sm text-danger">
              {formatUSD(co.creditUnappliedCents)} couldn&apos;t be applied — every
              remaining payment was already billed. Settle it by hand.
            </p>
          ) : null}
        </div>
      ) : null}

      {invoiceStuck || copyMissing ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 px-5 py-3 print:hidden">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-danger">
              Signed — setup didn&apos;t finish
            </p>
            <ul className="mt-1 space-y-0.5 font-sans text-xs text-ink">
              {invoiceStuck ? (
                <li>
                  Invoice not raised
                  {co.invoiceError ? (
                    <span className="block font-mono text-[11px] text-ink-muted">{co.invoiceError}</span>
                  ) : null}
                </li>
              ) : null}
              {copyMissing ? <li>Signed copy not emailed yet</li> : null}
            </ul>
          </div>
          <FinishSetupButton endpoint={`/api/admin/change-orders/${co.id}/finish-setup`} />
        </div>
      ) : null}

      <article className="rounded-2xl border border-border bg-surface p-8 md:p-10 print-plain">
        <ContractBody body={co.bodyMd} />
      </article>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-ink-muted">
          Signatures
        </h2>
        <SignaturePair
          agreementVersion={CURRENT_AGREEMENT_VERSION}
          adminSignerName={co.adminSignedName}
          adminSignedAt={co.adminSignedAt}
          clientName={co.clientName}
          clientSignerName={co.signedName}
          clientSignedAt={co.signedAt}
        />
        <p className="break-all font-mono text-[10px] text-ink-subtle">
          Document fingerprint (SHA-256): {co.bodySha256}
        </p>
      </section>
    </main>
  );
}
