import { Topbar } from '@/components/admin/topbar';
import {
  getClientsListPaginated,
  CONTACT_SORTS,
} from '@/lib/queries/admin';
import { ClientsListWithSelection } from '@/components/admin/clients/clients-list-with-selection';
import { PaginationFooter } from '@/components/ui/pagination-footer';
import { parseListParams } from '@/lib/list-params';

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseListParams(sp, {
    defaultSort: 'created_at',
    allowedSorts: CONTACT_SORTS,
  });

  const result = await getClientsListPaginated(params);

  return (
    <>
      <Topbar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 bg-bg">
          <ClientsListWithSelection
            rows={result.rows}
            currentSort={params.sort}
            currentDir={params.dir}
            searchParams={sp}
            totalCount={result.totalCount}
          />
        </div>

        <PaginationFooter
          page={params.page}
          pageSize={params.pageSize}
          totalCount={result.totalCount}
          searchParams={sp}
        />
      </div>
    </>
  );
}
