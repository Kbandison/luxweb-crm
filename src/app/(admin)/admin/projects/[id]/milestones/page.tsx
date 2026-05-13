import { getProjectMilestones } from '@/lib/queries/admin';
import { MilestonesList } from '@/components/admin/projects/milestones-list';

export default async function ProjectMilestonesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const milestones = await getProjectMilestones(id);

  // Tool tab — no max-width per workspace rule (files/milestones/time/messages/invoices).
  return (
    <main className="w-full px-8 py-8">
      <MilestonesList projectId={id} initial={milestones} />
    </main>
  );
}
