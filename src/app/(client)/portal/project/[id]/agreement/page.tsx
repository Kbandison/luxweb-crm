import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import {
  getClientProjectContracts,
  getClientProjectProposals,
} from '@/lib/queries/client';
import { formatDate, formatUSD } from '@/lib/formatters';
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_TONE,
  PROPOSAL_STATUS_LABEL,
  PROPOSAL_STATUS_TONE,
  type ContractStatus,
  type ProposalStatus,
} from '@/lib/status-meta';
import { cn } from '@/lib/utils';

export default async function ClientProjectAgreementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');
  const [proposals, contracts] = await Promise.all([
    getClientProjectProposals(id, session.userId),
    getClientProjectContracts(id, session.userId),
  ]);
  if (proposals === null || contracts === null) notFound();

  if (proposals.length === 0 && contracts.length === 0) {
    return (
      <main className="px-6 py-16 md:px-10">
        <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="font-display text-lg font-medium text-ink">
            No agreement yet
          </p>
          <p className="mx-auto mt-2 max-w-md font-sans text-sm text-ink-muted">
            Your proposal and signed agreement will appear here once shared by
            the team.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-10 px-6 py-10 md:px-10">
      <section>
        <SectionHead number="01" title={`Proposals · ${proposals.length}`} />
        {proposals.length === 0 ? (
          <Empty
            label="No proposal shared with you yet."
            className="mt-5"
          />
        ) : (
          <ul className="mt-5 overflow-hidden rounded-xl border border-border bg-surface divide-y divide-border">
            {proposals.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/portal/proposals/${p.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-sm font-medium text-ink">
                      {p.title}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                      {p.sentAt
                        ? `Shared ${formatDate(p.sentAt)}`
                        : `Created ${formatDate(p.createdAt)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]',
                        PROPOSAL_STATUS_TONE[p.status as ProposalStatus] ??
                          'bg-ink/5 text-ink-muted',
                      )}
                    >
                      {PROPOSAL_STATUS_LABEL[p.status as ProposalStatus] ?? p.status}
                    </span>
                    {p.totalCents != null ? (
                      <span className="font-mono text-sm font-medium tabular-nums text-ink">
                        {formatUSD(p.totalCents)}
                      </span>
                    ) : null}
                    <span
                      aria-hidden
                      className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper"
                    >
                      Open →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHead number="02" title={`Contract · ${contracts.length}`} />
        {contracts.length === 0 ? (
          <Empty
            label="Your development agreement will appear here once the proposal is accepted."
            className="mt-5"
          />
        ) : (
          <ul className="mt-5 overflow-hidden rounded-xl border border-border bg-surface divide-y divide-border">
            {contracts.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/portal/contracts/${c.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-sm font-medium text-ink">
                      Development Agreement {c.agreementVersion}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                      {c.signedAt
                        ? `Signed ${formatDate(c.signedAt)}`
                        : `Created ${formatDate(c.createdAt)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]',
                        CONTRACT_STATUS_TONE[c.status as ContractStatus] ??
                          'bg-ink/5 text-ink-muted',
                      )}
                    >
                      {CONTRACT_STATUS_LABEL[c.status as ContractStatus] ?? c.status}
                    </span>
                    <span
                      aria-hidden
                      className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper"
                    >
                      Open →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function SectionHead({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-lg font-semibold tabular-nums text-copper">
        {number}
      </span>
      <span aria-hidden className="h-3.5 w-px bg-copper/40" />
      <h2 className="font-display text-lg font-medium tracking-tight text-ink">
        {title}
      </h2>
    </div>
  );
}

function Empty({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center',
        className,
      )}
    >
      <p className="font-sans text-sm text-ink-muted">{label}</p>
    </div>
  );
}
