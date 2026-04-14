import type { InvoiceStatus } from '@/lib/queries/admin';
import { cn } from '@/lib/utils';

const TONE: Record<InvoiceStatus, string> = {
  draft: 'bg-ink/5 text-ink-muted',
  sent: 'bg-copper/15 text-copper',
  paid: 'bg-success/15 text-success',
  overdue: 'bg-danger/15 text-danger',
  void: 'bg-ink-subtle/10 text-ink-subtle line-through',
};

const LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
};

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em]',
        TONE[status],
      )}
    >
      {LABEL[status]}
    </span>
  );
}
