import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientChangeOrder, CHANGE_ORDER_STATUS_META } from '@/lib/queries/change-orders';
import { ContractBody } from '@/components/contract/contract-body';
import { SignaturePair } from '@/components/contract/signature-block';
import { StatusPill } from '@/components/ui/status-pill';
import { SectionHead } from '@/components/ui/section-head';
import { ChangeOrderActions } from '@/components/client/change-order-actions';
import { CURRENT_AGREEMENT_VERSION } from '@/lib/contracts/versions';
import { formatDateLong, formatUSD } from '@/lib/formatters';

/** A change order the client reviews and signs (or declines). */
export default async function ClientChangeOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');
  const co = await getClientChangeOrder(id, session.userId);
  if (!co) notFound();

  const open = co.status === 'sent' && !(co.expiresAt && new Date(co.expiresAt) <= new Date());
  const meta = CHANGE_ORDER_STATUS_META[co.status];

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-6 py-10 md:px-10 md:py-12">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
            Change order #{co.number}
          </p>
          <StatusPill label={open || co.status !== 'sent' ? meta.label : 'Expired'} tone={meta.tone} />
        </div>
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink">{co.title}</h1>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="font-mono text-[10px] uppercase tracking-meta text-ink-muted">Price</p>
          <p className="mt-1 font-mono text-xl tabular-nums text-ink">
            {co.amountCents === 0
              ? 'No change'
              : `${co.amountCents > 0 ? '+' : '−'}${formatUSD(Math.abs(co.amountCents))}`}
          </p>
          <p className="mt-1 font-sans text-xs text-ink-muted">
            {co.amountCents > 0
              ? co.billing === 'on_signing'
                ? 'Invoiced when you sign'
                : 'Invoiced when the work is approved'
              : co.amountCents < 0
                ? 'Credited against upcoming payments'
                : ''}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="font-mono text-[10px] uppercase tracking-meta text-ink-muted">Timeline</p>
          <p className="mt-1 font-mono text-xl tabular-nums text-ink">
            {co.timelineWeeks === 0
              ? 'No change'
              : `${co.timelineWeeks > 0 ? '+' : '−'}${Math.abs(co.timelineWeeks)} ${Math.abs(co.timelineWeeks) === 1 ? 'week' : 'weeks'}`}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="font-mono text-[10px] uppercase tracking-meta text-ink-muted">
            {co.status === 'sent' ? 'Open until' : 'Status'}
          </p>
          <p className="mt-1 font-sans text-sm text-ink">
            {co.status === 'sent' && co.expiresAt ? formatDateLong(co.expiresAt) : meta.label}
          </p>
        </div>
      </section>

      {open ? (
        <div className="print:hidden">
          <ChangeOrderActions
            changeOrderId={co.id}
            bodySha256={co.bodySha256}
            expectedSignerName={co.clientName}
          />
        </div>
      ) : co.status === 'sent' ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-6">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-warning">
            This change order has expired
          </p>
          <p className="mt-1 font-sans text-sm text-ink-muted">
            Your agreement is unchanged. Reply to our email if you&apos;d still like it.
          </p>
        </div>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHead title="The change order" />
          <a
            href={`/api/client/change-orders/${co.id}/pdf`}
            className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-meta text-ink-muted transition-colors hover:border-copper/40 hover:text-copper print:hidden"
          >
            Download PDF
          </a>
        </div>
        <article className="rounded-2xl border border-border bg-surface p-8 md:p-10 print-plain">
          <ContractBody body={co.bodyMd} />
        </article>
      </section>

      <section className="space-y-4">
        <SectionHead title="Signatures" />
        <SignaturePair
          agreementVersion={CURRENT_AGREEMENT_VERSION}
          adminSignerName={co.adminSignedName}
          adminSignedAt={co.adminSignedAt}
          clientName="You"
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
