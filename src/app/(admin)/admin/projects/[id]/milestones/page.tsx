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
    <main className="w-full space-y-6 px-8 py-8">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-medium text-ink">
          Milestones
        </h1>
        <p className="font-sans text-sm text-ink-muted">
          Phase the work, gate client review, and trigger payment when each
          milestone is approved.
        </p>
      </header>
      <MilestonesList projectId={id} initial={milestones} />
    </main>
  );
}
