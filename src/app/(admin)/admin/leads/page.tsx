import { Topbar } from '@/components/admin/topbar';
import {
  getContactDetail,
  getContactProposals,
  getLeadsPaginated,
  CONTACT_SORTS,
} from '@/lib/queries/admin';
import { LeadsListWithSelection } from '@/components/admin/leads/leads-list-with-selection';
import {
  LeadDetail,
  LeadDetailEmpty,
} from '@/components/admin/leads/lead-detail';
import { NewLeadDrawer } from '@/components/admin/leads/new-lead-drawer';
import { PaginationFooter } from '@/components/ui/pagination-footer';
import { parseListParams } from '@/lib/list-params';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const leadId = typeof sp.lead === 'string' ? sp.lead : undefined;

  const params = parseListParams(sp, {
    defaultSort: 'created_at',
    allowedSorts: CONTACT_SORTS,
  });

  const [result, selected] = await Promise.all([
    getLeadsPaginated(params),
    leadId ? getContactDetail(leadId) : Promise.resolve(null),
  ]);
  const proposals = selected ? await getContactProposals(selected.id) : [];

  return (
    <>
      <Topbar title="Leads" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-6 py-4">
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-meta-hero text-ink-subtle">
              <span>Admin</span>
              <span className="text-copper">/</span>
              <span className="text-ink">Leads</span>
            </nav>
            <span aria-hidden className="h-3 w-px bg-border" />
            <p className="font-mono text-[10px] tabular-nums uppercase tracking-meta text-ink-muted">
              {result.totalCount} total
            </p>
          </div>
          <NewLeadDrawer />
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[380px_1fr]">
          <div
            className={`${selected ? 'hidden lg:block' : ''} flex min-h-0 flex-col border-r border-border bg-surface`}
          >
            <LeadsListWithSelection
              rows={result.rows}
              selectedId={selected?.id ?? null}
              currentSort={params.sort}
              currentDir={params.dir}
              searchParams={sp}
            />
            <PaginationFooter
              page={params.page}
              pageSize={params.pageSize}
              totalCount={result.totalCount}
              searchParams={sp}
            />
          </div>

          <div
            className={`${selected ? '' : 'hidden lg:block'} min-h-0 bg-bg`}
          >
            {selected ? (
              <LeadDetail lead={selected} proposals={proposals} />
            ) : (
              <LeadDetailEmpty />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
