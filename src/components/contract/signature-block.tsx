import { formatDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export type SignatureBlockProps = {
  /** "LuxWeb Studio" or the client's full name */
  party: string;
  signerName: string | null;
  signedAt: string | null;
  ip?: string | null;
  /** Tone for the title pill */
  tone?: 'copper' | 'success';
  /** Pending-state explanatory line shown when no signature yet */
  pendingLabel?: string;
};

/**
 * Visible signature block — replaces the static signature stub at the
 * bottom of the agreement template. Renders the actual digital signature
 * (typed name + cursive font) when present, or a "Pending" hint when not.
 */
export function SignatureBlock({
  party,
  signerName,
  signedAt,
  ip,
  tone = 'copper',
  pendingLabel = 'Pending signature',
}: SignatureBlockProps) {
  const signed = !!signerName && !!signedAt;
  return (
    <div
      className={cn(
        'rounded-xl border bg-surface p-5',
        signed
          ? 'border-success/30 bg-success/5'
          : 'border-border',
      )}
    >
      <p
        className={cn(
          'font-mono text-[10px] font-medium uppercase tracking-meta-hero',
          signed
            ? 'text-success'
            : tone === 'copper'
              ? 'text-copper'
              : 'text-success',
        )}
      >
        {party}
      </p>
      {signed ? (
        <>
          <p
            className="mt-2 font-display text-2xl italic tracking-tight text-ink"
            style={{
              fontFamily:
                '"Brush Script MT", "Apple Chancery", "Lucida Handwriting", cursive',
            }}
          >
            {signerName}
          </p>
          <dl className="mt-3 grid gap-2 font-mono text-[11px] tabular-nums text-ink-muted sm:grid-cols-2">
            <div>
              <dt className="uppercase tracking-meta text-ink-subtle">
                Signed
              </dt>
              <dd className="mt-0.5 text-ink">{formatDateTime(signedAt)}</dd>
            </div>
            {ip ? (
              <div>
                <dt className="uppercase tracking-meta text-ink-subtle">
                  IP
                </dt>
                <dd className="mt-0.5 break-all text-ink">{ip}</dd>
              </div>
            ) : null}
          </dl>
        </>
      ) : (
        <p className="mt-2 font-sans text-sm text-ink-muted">{pendingLabel}</p>
      )}
    </div>
  );
}

/**
 * Pair of signature blocks side-by-side — what the contract page shows
 * below the body so both parties' status is visible at a glance.
 */
export function SignaturePair({
  adminSignerName,
  adminSignedAt,
  adminIp,
  clientName,
  clientSignerName,
  clientSignedAt,
  clientIp,
}: {
  adminSignerName: string | null;
  adminSignedAt: string | null;
  adminIp?: string | null;
  clientName: string;
  clientSignerName: string | null;
  clientSignedAt: string | null;
  clientIp?: string | null;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SignatureBlock
        party="LuxWeb Studio"
        signerName={adminSignerName}
        signedAt={adminSignedAt}
        ip={adminIp}
        pendingLabel="Awaiting our signature"
      />
      <SignatureBlock
        party={clientName}
        signerName={clientSignerName}
        signedAt={clientSignedAt}
        ip={clientIp}
        pendingLabel="Awaiting client signature"
      />
    </div>
  );
}
