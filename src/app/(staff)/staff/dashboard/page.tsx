import { redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import {
  getAssignedProjectsForUser,
  getTeamMemberByUserId,
} from '@/lib/queries/team';

/**
 * Contractor workspace landing (Pass 1 stub). Shows the projects they're
 * assigned to so an invited member isn't stranded. The full workspace —
 * project detail, time tracking, own-lead management, and messaging — lands
 * in Pass 2.
 */
export default async function StaffDashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [member, projects] = await Promise.all([
    getTeamMemberByUserId(session.userId),
    getAssignedProjectsForUser(session.userId),
  ]);

  const firstName = (member?.fullName ?? session.email).split(' ')[0];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-6 pb-16 pt-10 md:px-10">
      <PageHeader
        eyebrow="Workspace"
        title={`Welcome, ${firstName}`}
        description="The projects you're assigned to. Time tracking, your leads, and messaging are coming soon."
      />

      {projects.length === 0 ? (
        <EmptyState
          title="No assigned projects yet"
          description="When the studio assigns you to a project, it'll show up here."
        />
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => (
            <li key={p.projectId}>
              <Card padding="md" className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{p.projectName}</p>
                  {p.roleOnProject ? (
                    <p className="mt-0.5 font-sans text-xs text-ink-subtle">
                      {p.roleOnProject}
                    </p>
                  ) : null}
                </div>
                <StatusPill
                  label={p.status.replace(/_/g, ' ')}
                  tone="bg-surface-2 text-ink-muted"
                  size="sm"
                />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
