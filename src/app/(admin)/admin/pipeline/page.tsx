import { Topbar } from '@/components/admin/topbar';
import { getContacts, getDealsForKanban } from '@/lib/queries/admin';
import { KanbanBoard } from '@/components/admin/pipeline/kanban-board';
import { NewDealDrawer } from '@/components/admin/pipeline/new-deal-drawer';
import { formatUSD } from '@/lib/formatters';

const OPEN_STAGES: ReadonlyArray<string> = [
  'lead',
  'discovery',
  'proposal',
  'active',
];

export default async function PipelinePage() {
  const [deals, contacts] = await Promise.all([
    getDealsForKanban(),
    getContacts(),
  ]);

  const openValueCents = deals
    .filter((d) => OPEN_STAGES.includes(d.stage))
    .reduce((s, d) => s + d.valueCents, 0);

  return (
    <>
      <Topbar title="Pipeline" />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Sub-header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-6 py-4">
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
              <span>Admin</span>
              <span className="text-copper">/</span>
              <span className="text-ink">Pipeline</span>
            </nav>
            <span aria-hidden className="h-3 w-px bg-border" />
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-base font-medium tabular-nums tracking-tight text-ink">
                {formatUSD(openValueCents)}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                open
              </span>
            </div>
            <span aria-hidden className="h-3 w-px bg-border" />
            <p className="font-mono text-[10px] tabular-nums uppercase tracking-[0.18em] text-ink-muted">
              {deals.length} {deals.length === 1 ? 'deal' : 'deals'} total
            </p>
          </div>
          <NewDealDrawer contacts={contacts} />
        </div>

        {/* Board */}
        <div className="min-h-0 flex-1 bg-bg">
          {deals.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 py-12">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-copper/15 via-copper-soft/50 to-transparent ring-1 ring-copper/15">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-6 w-6 text-copper/70"
                    aria-hidden
                  >
                    <path d="M6 5v11" />
                    <path d="M12 5v6" />
                    <path d="M18 5v14" />
                  </svg>
                </div>
                <p className="mt-4 font-display text-lg font-medium text-ink">
                  Pipeline is empty
                </p>
                <p className="mt-1 max-w-sm font-sans text-sm text-ink-muted">
                  {contacts.length === 0
                    ? 'Add a lead first, then open a deal against them to start tracking.'
                    : 'Open your first deal — drag cards between the 6 stages to track progress.'}
                </p>
              </div>
            </div>
          ) : (
            <KanbanBoard initialDeals={deals} />
          )}
        </div>
      </div>
    </>
  );
}
