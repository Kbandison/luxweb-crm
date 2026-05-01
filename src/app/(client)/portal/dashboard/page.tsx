import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientDashboard } from '@/lib/queries/client';
import { cn } from '@/lib/utils';
import { formatUSD, formatDateLong } from '@/lib/formatters';
import {
  PROJECT_STATUS_DOT as STATUS_DOT,
  PROJECT_STATUS_LABEL as STATUS_LABEL,
} from '@/components/admin/projects/status-meta';
import {
  PROPOSAL_STATUS_LABEL,
  PROPOSAL_STATUS_TONE,
  type ProposalStatus,
} from '@/lib/status-meta';

export default async function ClientDashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const dash = await getClientDashboard(session.userId);
  const focus = dash.projects[0] ?? null;
  const others = dash.projects.slice(1);
  const greeting = greetingFor();

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-14">
      {/* Greeting */}
      <header className="mb-10 space-y-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-copper">
          {greeting}
        </p>
        <h1 className="font-display text-4xl font-medium tracking-tight text-ink md:text-5xl">
          Welcome back, {dash.displayName}.
        </h1>
        <p className="max-w-xl font-sans text-sm text-ink-muted">
          Everything for your engagement with LuxWeb Studio in one place.
        </p>
      </header>

      {dash.pendingContracts.length > 0 ? (
        <PendingContractsBanner contracts={dash.pendingContracts} />
      ) : null}

      {focus ? (
        <FocusProject project={focus} />
      ) : dash.pendingProposals.length > 0 ? (
        <PendingProposalsFocus proposals={dash.pendingProposals} />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="font-display text-lg font-medium text-ink">
            Nothing to show
          </p>
          <p className="mx-auto mt-2 max-w-md font-sans text-sm text-ink-muted">
            Once the team sends a proposal or spins up your project, it will
            appear here.
          </p>
        </div>
      )}

      {(() => {
        // Proposals tile takes the right slot when there's a focus project AND
        // pending proposals — pushing other-projects to the bottom row, since
        // an open proposal is more time-sensitive than a list of past projects.
        const showProposalsAside =
          !!focus && dash.pendingProposals.length > 0;
        return (
          <>
            <section className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
              <UnpaidInvoices invoices={dash.unpaidInvoices} />
              {showProposalsAside ? (
                <ProposalsTile proposals={dash.pendingProposals} />
              ) : (
                <OtherProjects projects={others} />
              )}
            </section>

            {showProposalsAside ? (
              <section className="mt-10">
                <OtherProjects projects={others} />
              </section>
            ) : null}
          </>
        );
      })()}
    </main>
  );
}

function PendingContractsBanner({
  contracts,
}: {
  contracts: import('@/lib/queries/client').ClientDashboardContract[];
}) {
  const primary = contracts[0];
  return (
    <section className="mb-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-copper/30 bg-copper-soft/25 p-6">
      <div>
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-copper">
          Step 2 · Sign your agreement
        </p>
        <p className="mt-1 font-display text-lg font-medium text-ink">
          {primary.proposalTitle}
        </p>
        <p className="mt-1 font-sans text-sm text-ink-muted">
          You&apos;ve accepted the proposal. One more signature to lock in the
          legal terms.
        </p>
      </div>
      <Link
        href={`/portal/contracts/${primary.id}`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-copper px-4 py-2 font-sans text-sm font-medium text-copper-foreground transition-colors hover:bg-copper/90"
      >
        Open agreement
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </Link>
    </section>
  );
}

function PendingProposalsFocus({
  proposals,
}: {
  proposals: import('@/lib/queries/client').ClientDashboardProposal[];
}) {
  const awaiting = proposals.filter((p) => p.status === 'sent');
  const primary = awaiting[0] ?? proposals[0];
  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-border bg-surface p-8 copper-mesh md:p-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-gradient-to-br from-copper/22 via-gold/10 to-transparent blur-3xl"
      />
      <div className="relative">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-copper">
          {awaiting.length > 0 ? 'Awaiting your review' : 'Proposals'}
        </p>
        <h2 className="mt-3 font-display text-3xl font-medium tracking-tight text-ink md:text-5xl">
          {primary.title}
        </h2>
        {primary.totalCents != null ? (
          <p className="mt-4 font-mono text-xl tabular-nums text-ink-muted">
            {formatUSD(primary.totalCents)}
          </p>
        ) : null}
        <div className="copper-rule mt-10 h-px w-32" />
        <div className="mt-6">
          <Link
            href={`/portal/proposals/${primary.id}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-copper px-4 py-2 font-sans text-sm font-medium text-copper-foreground transition-colors hover:bg-copper/90"
          >
            Open proposal
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

function ProposalsTile({
  proposals,
}: {
  proposals: import('@/lib/queries/client').ClientDashboardProposal[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
        Proposals
      </p>
      <ul className="mt-4 space-y-2">
        {proposals.map((p) => (
          <li key={p.id}>
            <Link
              href={`/portal/proposals/${p.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:border-copper/40"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans text-sm font-medium text-ink">
                  {p.title}
                </p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
                  {p.sentAt
                    ? `Shared ${formatDateLong(p.sentAt)}`
                    : '—'}
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
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FocusProject({
  project,
}: {
  project: import('@/lib/queries/client').ClientProjectTile;
}) {
  const pct =
    project.milestoneProgress.total === 0
      ? 0
      : Math.round(
          (project.milestoneProgress.done / project.milestoneProgress.total) *
            100,
        );

  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-border bg-surface p-8 copper-mesh md:p-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-gradient-to-br from-copper/22 via-gold/10 to-transparent blur-3xl"
      />

      <div className="relative">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-copper">
          Active project
        </p>
        <h2 className="mt-3 font-display text-3xl font-medium tracking-tight text-ink md:text-5xl">
          {project.name}
        </h2>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                STATUS_DOT[project.status] ?? 'bg-ink-subtle',
              )}
              aria-hidden
            />
            {STATUS_LABEL[project.status] ?? project.status}
          </span>
          {project.startDate || project.endDate ? (
            <span className="font-mono text-xs tabular-nums text-ink-subtle">
              {formatDateLong(project.startDate)}
              {' → '}
              {formatDateLong(project.endDate)}
            </span>
          ) : null}
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
              Progress
            </p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-medium tabular-nums text-ink">
                {project.milestoneProgress.done}
              </span>
              <span className="font-mono text-lg tabular-nums text-ink-subtle">
                / {project.milestoneProgress.total}
              </span>
              <span className="font-sans text-sm text-ink-muted">milestones</span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-copper transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1.5 font-mono text-[10px] tabular-nums text-ink-subtle">
              {pct}% complete
            </p>
          </div>

          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
              Up next
            </p>
            {project.nextMilestone ? (
              <>
                <p className="mt-3 font-display text-lg font-medium text-ink">
                  {project.nextMilestone.title}
                </p>
                <p className="mt-1 font-mono text-xs tabular-nums text-ink-subtle">
                  {project.nextMilestone.dueDate
                    ? `Due ${formatDateLong(project.nextMilestone.dueDate)}`
                    : 'No due date'}
                </p>
              </>
            ) : (
              <p className="mt-3 font-sans text-sm text-ink-muted">
                All milestones are done.
              </p>
            )}
          </div>
        </div>

        <div className="copper-rule mt-10 h-px w-32" />

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/portal/project/${project.id}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-copper px-4 py-2 font-sans text-sm font-medium text-copper-foreground transition-colors hover:bg-copper/90"
          >
            Open project
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
          <Link
            href={`/portal/project/${project.id}/files`}
            className="inline-flex items-center rounded-md border border-border bg-surface px-4 py-2 font-sans text-sm font-medium text-ink transition-colors hover:border-border-strong"
          >
            Files
          </Link>
          <Link
            href={`/portal/project/${project.id}/invoices`}
            className="inline-flex items-center rounded-md border border-border bg-surface px-4 py-2 font-sans text-sm font-medium text-ink transition-colors hover:border-border-strong"
          >
            Invoices
          </Link>
        </div>
      </div>
    </section>
  );
}

function UnpaidInvoices({
  invoices,
}: {
  invoices: import('@/lib/queries/client').ClientInvoiceTile[];
}) {
  const total = invoices.reduce((s, i) => s + i.amountCents, 0);
  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
            Open invoices
          </p>
          <p className="mt-2 font-mono text-3xl font-medium tabular-nums tracking-tight text-ink">
            {formatUSD(total)}
          </p>
        </div>
        <span className="font-mono text-[10px] tabular-nums text-ink-subtle">
          {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}
        </span>
      </div>

      {invoices.length === 0 ? (
        <p className="mt-5 font-sans text-sm text-ink-muted">
          No invoices waiting. You&apos;re all caught up.
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className={cn(
                'flex items-center justify-between gap-3 rounded-lg border border-border p-3',
                inv.status === 'overdue' && 'border-danger/30 bg-danger/5',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans text-sm font-medium text-ink">
                  {inv.description ?? 'Invoice'}
                </p>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                  {inv.status === 'overdue' ? (
                    <span className="text-danger">Overdue</span>
                  ) : (
                    <span>Due</span>
                  )}
                  {inv.dueDate ? ` · ${formatDateLong(inv.dueDate)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-sm font-medium tabular-nums text-ink">
                  {formatUSD(inv.amountCents)}
                </span>
                {inv.projectId ? (
                  <Link
                    href={`/portal/project/${inv.projectId}/invoices/${inv.id}/pay`}
                    className="inline-flex items-center gap-1 rounded-md bg-copper px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-copper-foreground transition-colors hover:bg-copper/90"
                  >
                    Pay
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3 w-3"
                      aria-hidden
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OtherProjects({
  projects,
}: {
  projects: import('@/lib/queries/client').ClientProjectTile[];
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
        Other projects
      </p>
      {projects.length === 0 ? (
        <p className="mt-3 font-sans text-sm text-ink-muted">
          No other projects — the one above is your current engagement.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/portal/project/${p.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:border-copper/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-sm font-medium text-ink">
                    {p.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
                    <span
                      className={cn(
                        'mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle',
                        STATUS_DOT[p.status] ?? 'bg-ink-subtle',
                      )}
                      aria-hidden
                    />
                    {STATUS_LABEL[p.status] ?? p.status}
                  </p>
                </div>
                <span className="font-mono text-xs tabular-nums text-ink-subtle">
                  {p.milestoneProgress.done}/{p.milestoneProgress.total}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function greetingFor(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
