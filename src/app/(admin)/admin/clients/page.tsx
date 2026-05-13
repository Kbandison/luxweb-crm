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
      <Topbar title="Clients" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-6 py-4">
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-meta-hero text-ink-subtle">
              <span>Admin</span>
              <span className="text-copper">/</span>
              <span className="text-ink">Clients</span>
            </nav>
            <span aria-hidden className="h-3 w-px bg-border" />
            <p className="font-mono text-[10px] tabular-nums uppercase tracking-meta text-ink-muted">
              {result.totalCount} total
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-bg">
          <ClientsListWithSelection
            rows={result.rows}
            currentSort={params.sort}
            currentDir={params.dir}
            searchParams={sp}
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
