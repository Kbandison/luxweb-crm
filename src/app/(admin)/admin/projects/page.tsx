import { Topbar } from '@/components/admin/topbar';
import {
  getContacts,
  getProjectsPaginated,
  PROJECT_SORTS,
} from '@/lib/queries/admin';
import { ProjectsTable } from '@/components/admin/projects/projects-table';
import { NewProjectDrawer } from '@/components/admin/projects/new-project-drawer';
import { PageHeader } from '@/components/ui/page-header';
import { PaginationFooter } from '@/components/ui/pagination-footer';
import { parseListParams } from '@/lib/list-params';

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseListParams(sp, {
    defaultSort: 'created_at',
    allowedSorts: PROJECT_SORTS,
  });

  const [result, contacts] = await Promise.all([
    getProjectsPaginated(params),
    getContacts(),
  ]);

  return (
    <>
      <Topbar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-border bg-surface px-6 pb-4 pt-6">
          <PageHeader
            title="Projects"
            description={`${result.totalCount} total`}
            actions={<NewProjectDrawer contacts={contacts} />}
          />
        </div>

        <div className="min-h-0 flex-1 bg-bg">
          <ProjectsTable
            initial={result.rows}
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
