import { Topbar } from '@/components/admin/topbar';
import {
  getContacts,
  getProjectsPaginated,
  PROJECT_SORTS,
} from '@/lib/queries/admin';
import { ProjectsTable } from '@/components/admin/projects/projects-table';
import { NewProjectDrawer } from '@/components/admin/projects/new-project-drawer';
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
      <Topbar title="Projects" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-6 py-4">
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
              <span>Admin</span>
              <span className="text-copper">/</span>
              <span className="text-ink">Projects</span>
            </nav>
            <span aria-hidden className="h-3 w-px bg-border" />
            <p className="font-mono text-[10px] tabular-nums uppercase tracking-[0.18em] text-ink-muted">
              {result.totalCount} total
            </p>
          </div>
          <NewProjectDrawer contacts={contacts} />
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
