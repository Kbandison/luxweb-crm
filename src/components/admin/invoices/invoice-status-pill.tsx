import type { InvoiceStatus } from '@/lib/queries/admin';
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE } from '@/lib/status-meta';
import { cn } from '@/lib/utils';

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-meta-tight',
        INVOICE_STATUS_TONE[status],
      )}
    >
      {INVOICE_STATUS_LABEL[status]}
    </span>
  );
}
