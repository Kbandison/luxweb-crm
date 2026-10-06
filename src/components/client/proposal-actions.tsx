'use client';
import { Button } from '@/components/ui/button';
import { formatDateLong } from '@/lib/formatters';
import { cn } from '@/lib/utils';

/** Small print-action rendered above the proposal. Hidden in print output. */
export function PrintBar() {
  return (
    <div className="flex justify-end print:hidden">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => window.print()}
      >
        Print
      </Button>
    </div>
  );
}

type Status = 'sent' | 'accepted' | 'rejected' | 'expired';

export function ClientProposalActions({
  status,
  acceptedAt,
}: {
  status: Status;
  acceptedAt: string | null;
}) {
  return (
    <div>
      {status === 'sent' ? (
        // Sent agreements are signed on their contract page, which this
        // view forwards to — reaching here means it isn't ready yet.
        <StatusBanner tone="warning" label="Not ready to sign yet">
          We&apos;re finalizing this agreement and will email you when
          it&apos;s ready.
        </StatusBanner>
      ) : status === 'accepted' ? (
        <AcceptedBanner acceptedAt={acceptedAt} />
      ) : status === 'rejected' ? (
        <StatusBanner tone="danger" label="This agreement was declined">
          Reach out to the team if you&apos;d like to revisit.
        </StatusBanner>
      ) : (
        <StatusBanner tone="warning" label="This agreement has expired">
          Contact the team for an updated version.
        </StatusBanner>
      )}
    </div>
  );
}

function AcceptedBanner({ acceptedAt }: { acceptedAt: string | null }) {
  return (
    <div className="rounded-2xl border border-success/30 bg-success/5 p-6">
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success ring-1 ring-success/20"
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
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-success">
            Accepted
          </p>
          <p className="mt-0.5 font-display text-base font-medium text-ink">
            Thanks — we&apos;re on it.
          </p>
          {acceptedAt ? (
            <p className="mt-0.5 font-mono text-xs tabular-nums text-ink-muted">
              Signed {formatDateLong(acceptedAt)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatusBanner({
  tone,
  label,
  children,
}: {
  tone: 'danger' | 'warning';
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-6',
        tone === 'danger' ? 'border-danger/30 bg-danger/5' : 'border-warning/30 bg-warning/5',
      )}
    >
      <p
        className={cn(
          'font-mono text-[10px] font-medium uppercase tracking-meta-hero',
          tone === 'danger' ? 'text-danger' : 'text-warning',
        )}
      >
        {label}
      </p>
      <p className="mt-1 font-sans text-sm text-ink-muted">{children}</p>
    </div>
  );
}
