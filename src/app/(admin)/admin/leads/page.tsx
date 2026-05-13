import { Topbar } from '@/components/admin/topbar';
import {
  getContactActivity,
  getContactDetail,
  getContactProposals,
  getLeadsPaginated,
  getNotesForEntity,
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
  const [proposals, notes, activity] = selected
    ? await Promise.all([
        getContactProposals(selected.id),
        getNotesForEntity('contact', selected.id),
        getContactActivity(selected.id),
      ])
    : [[], [], []];

  return (
    <>
      <Topbar />

      <div className="flex flex-1 flex-col overflow-hidden">
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
              totalCount={result.totalCount}
              newLeadSlot={<NewLeadDrawer />}
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
              <LeadDetail
                lead={selected}
                proposals={proposals}
                notes={notes}
                activity={activity}
              />
            ) : (
              <LeadDetailEmpty />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
