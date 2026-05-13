import Link from 'next/link';
import {
  getProjectContracts,
  getProjectProposals,
  linkOrphanProposalsToProject,
} from '@/lib/queries/admin';
import { SignAgreementButton } from '@/components/admin/proposals/sign-agreement-button';
import { SectionHead } from '@/components/ui/section-head';
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

export default async function AdminProjectAgreementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Adopt any contact-scoped orphans before listing.
  await linkOrphanProposalsToProject(id);
  const [proposals, contracts] = await Promise.all([
    getProjectProposals(id),
    getProjectContracts(id),
  ]);
  const proposalsWithContract = new Set(contracts.map((c) => c.proposalId));

  if (proposals.length === 0 && contracts.length === 0) {
    return (
      <main className="mx-auto w-full max-w-5xl px-8 py-8">
        <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="font-display text-lg font-medium text-ink">
            No agreement yet
          </p>
          <p className="mx-auto mt-2 max-w-md font-sans text-sm text-ink-muted">
            Create a proposal from the client&apos;s page. The contract auto-generates
            once the proposal is accepted.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-10 px-8 py-8">
      <section>
        <SectionHead
          number="01"
          title={`Proposals · ${proposals.length}`}
        />
        {proposals.length === 0 ? (
          <Empty label="No proposal on this project yet." className="mt-5" />
        ) : (
          <ul className="mt-5 overflow-hidden rounded-xl border border-border bg-surface divide-y divide-border">
            {proposals.map((p) => {
              const orphan =
                p.status === 'accepted' && !proposalsWithContract.has(p.id);
              return (
                <li key={p.id}>
                  <Link
                    href={`/admin/projects/${id}/proposals/${p.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-sans text-sm font-medium text-ink">
                        {p.title}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] uppercase tracking-meta-tight text-ink-subtle">
                        {p.sentAt
                          ? `Sent ${formatDate(p.sentAt)}`
                          : `Created ${formatDate(p.createdAt)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-meta-tight',
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
                        className="font-mono text-[10px] uppercase tracking-meta text-copper"
                      >
                        Open →
                      </span>
                    </div>
                  </Link>
                  {orphan ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-copper/30 bg-copper/5 px-5 py-3">
                      <p className="font-sans text-xs text-copper">
                        Accepted by client. Counter-sign to create the
                        agreement and send it for their signature.
                      </p>
                      <SignAgreementButton proposalId={p.id} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <SectionHead
          number="02"
          title={`Contract · ${contracts.length}`}
        />
        {contracts.length === 0 ? (
          <Empty
            label="Contract auto-generates when the client accepts the proposal."
            className="mt-5"
          />
        ) : (
          <ul className="mt-5 overflow-hidden rounded-xl border border-border bg-surface divide-y divide-border">
            {contracts.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/projects/${id}/contracts/${c.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-sm font-medium text-ink">
                      Agreement {c.agreementVersion}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] uppercase tracking-meta-tight text-ink-subtle">
                      {c.signedAt
                        ? `Signed ${formatDate(c.signedAt)}`
                        : `Created ${formatDate(c.createdAt)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-meta-tight',
                        CONTRACT_STATUS_TONE[c.status as ContractStatus] ??
                          'bg-ink/5 text-ink-muted',
                      )}
                    >
                      {CONTRACT_STATUS_LABEL[c.status as ContractStatus] ?? c.status}
                    </span>
                    <span
                      aria-hidden
                      className="font-mono text-[10px] uppercase tracking-meta text-copper"
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
