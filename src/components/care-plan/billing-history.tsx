import type { CarePlanInvoice } from '@/lib/care-plan/billing-history';
import { formatDateLong, formatUSD } from '@/lib/formatters';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<CarePlanInvoice['status'], string> = {
  draft: 'Draft',
  open: 'Open',
  paid: 'Paid',
  void: 'Void',
  uncollectible: 'Uncollectible',
};

const STATUS_TONE: Record<CarePlanInvoice['status'], string> = {
  draft: 'bg-ink/5 text-ink-muted',
  open: 'bg-warning/15 text-warning',
  paid: 'bg-success/15 text-success',
  void: 'bg-ink/5 text-ink-subtle',
  uncollectible: 'bg-danger/15 text-danger',
};

export function CarePlanBillingHistory({
  invoices,
}: {
  invoices: CarePlanInvoice[];
}) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/60 p-6 text-center">
        <p className="font-sans text-sm text-ink-muted">
          No billing history. Once the plan renews, past invoices show up here.
        </p>
      </div>
    );
  }

  return (
    <ul className="overflow-hidden rounded-xl border border-border bg-surface divide-y divide-border">
      {invoices.map((inv) => (
        <li
          key={inv.id}
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-subtle">
              {inv.number ?? inv.id.slice(0, 12)}
              <span className="ml-2 normal-case tracking-normal text-ink-muted">
                {inv.paidAt
                  ? `Paid ${formatDateLong(inv.paidAt)}`
                  : `Created ${formatDateLong(inv.createdAt)}`}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span
              className={cn(
                'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em]',
                STATUS_TONE[inv.status],
              )}
            >
              {STATUS_LABEL[inv.status]}
            </span>
            <span className="font-mono text-sm font-medium tabular-nums text-ink">
              {formatUSD(
                inv.status === 'paid' ? inv.amountPaidCents : inv.amountDueCents,
              )}
            </span>
            {inv.hostedInvoiceUrl ? (
              <a
                href={inv.hostedInvoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper hover:underline"
              >
                View →
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
