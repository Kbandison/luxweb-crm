import type { InvoiceStatus } from '@/lib/queries/admin';
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE } from '@/lib/status-meta';
import { StatusPill } from '@/components/ui/status-pill';

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  return (
    <StatusPill
      label={INVOICE_STATUS_LABEL[status]}
      tone={INVOICE_STATUS_TONE[status]}
    />
  );
}
