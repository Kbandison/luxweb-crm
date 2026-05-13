import { notFound } from 'next/navigation';
import { Topbar } from '@/components/admin/topbar';
import { getProjectDetail } from '@/lib/queries/admin';
import { ProjectHeader } from '@/components/admin/projects/project-header';
import { ProjectNav } from '@/components/admin/projects/project-nav';
import { ProjectRefresher } from '@/components/realtime/project-refresher';
import { ProjectRowRefresher } from '@/components/realtime/project-row-refresher';

export default async function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProjectDetail(id);
  if (!project) notFound();

  return (
    <>
      <Topbar />
      <ProjectHeader project={project} />
      <ProjectNav projectId={id} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-bg">{children}</div>
      <ProjectRefresher projectId={id} />
      <ProjectRowRefresher projectId={id} />
    </>
  );
}
