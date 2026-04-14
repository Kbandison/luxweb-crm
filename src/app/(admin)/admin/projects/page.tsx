import { Topbar } from '@/components/admin/topbar';
import { getContacts, getProjects } from '@/lib/queries/admin';
import { ProjectsTable } from '@/components/admin/projects/projects-table';
import { NewProjectDrawer } from '@/components/admin/projects/new-project-drawer';

export default async function ProjectsPage() {
  const [projects, contacts] = await Promise.all([
    getProjects(),
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
              {projects.length} total
            </p>
          </div>
          <NewProjectDrawer contacts={contacts} />
        </div>

        <div className="min-h-0 flex-1 bg-bg">
          <ProjectsTable initial={projects} />
        </div>
      </div>
    </>
  );
}
