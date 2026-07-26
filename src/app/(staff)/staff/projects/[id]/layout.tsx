import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAssignedProjectPage } from '@/lib/staff/access';
import { getProjectDetail } from '@/lib/queries/admin';
import { StatusPill } from '@/components/ui/status-pill';
import { StaffProjectNav } from '@/components/staff/staff-project-nav';

export default async function StaffProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAssignedProjectPage(id);
  const project = await getProjectDetail(id);
  if (!project) notFound();

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="px-6 pb-4 pt-8">
        <Link
          href="/staff/dashboard"
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-meta text-ink-subtle transition-colors hover:text-copper"
        >
          ← Workspace
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-medium tracking-tight text-ink md:text-3xl">
            {project.name}
          </h1>
          <StatusPill
            label={project.status.replace(/_/g, ' ')}
            tone="bg-surface-2 text-ink-muted"
            size="sm"
          />
        </div>
        <p className="mt-1 font-sans text-sm text-ink-muted">
          {project.contactCompany ?? project.contactName}
        </p>
      </header>
      <StaffProjectNav projectId={id} />
      <div className="px-6 py-8">{children}</div>
    </div>
  );
}
