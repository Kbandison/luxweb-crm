import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientProjectProposals } from '@/lib/queries/client';
import { formatDate, formatUSD } from '@/lib/formatters';
import {
  PROPOSAL_STATUS_LABEL,
  PROPOSAL_STATUS_TONE,
  type ProposalStatus,
} from '@/lib/status-meta';
import { cn } from '@/lib/utils';

export default async function ClientProjectProposalsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');
  const proposals = await getClientProjectProposals(id, session.userId);
  if (proposals === null) notFound();

  // Single proposal → open directly (per user preference).
  if (proposals.length === 1) {
    redirect(`/portal/proposals/${proposals[0].id}`);
  }

  if (proposals.length === 0) {
    return (
      <main className="px-6 py-16 md:px-10">
        <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="font-display text-lg font-medium text-ink">
No proposals
          </p>
          <p className="mx-auto mt-2 max-w-md font-sans text-sm text-ink-muted">
            When the team shares a proposal with you, it will appear here for
            review and sign-off.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6 px-6 py-10 md:px-10">
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <ul className="divide-y divide-border">
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
      </div>
    </main>
  );
}
