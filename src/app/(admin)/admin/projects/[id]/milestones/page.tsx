import { getProjectMilestones } from '@/lib/queries/admin';
import { MilestonesList } from '@/components/admin/projects/milestones-list';

export default async function ProjectMilestonesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const milestones = await getProjectMilestones(id);

  return (
    <main className="mx-auto w-full max-w-5xl px-8 py-8">
      <MilestonesList projectId={id} initial={milestones} />
    </main>
  );
}
