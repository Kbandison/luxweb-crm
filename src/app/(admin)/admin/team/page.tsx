import { redirect } from 'next/navigation';
import { Topbar } from '@/components/admin/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { getSession } from '@/lib/supabase/session';
import { hasCapability } from '@/lib/auth/permissions';
import { getTeamMembers } from '@/lib/queries/team';
import { TeamTable } from '@/components/admin/team/team-table';
import { TeamMemberDrawer } from '@/components/admin/team/team-member-drawer';

export default async function TeamPage() {
  const session = await getSession();
  // The layout guarantees a back-office session; narrow to manage_team here
  // so finance (which can enter /admin but not the roster) is bounced.
  if (!session || !hasCapability(session.role, 'manage_team')) {
    redirect('/admin/dashboard');
  }
  const canAssignOwner = hasCapability(session.role, 'assign_owner_role');
  const members = await getTeamMembers();

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-6xl space-y-8 px-6 pb-16 pt-10 md:px-10">
        <PageHeader
          eyebrow="Delivery"
          title="Team"
          description="Employees and contractors, their access, pay, and project assignments."
          actions={<TeamMemberDrawer canAssignOwner={canAssignOwner} />}
        />

        {members.length === 0 ? (
          <EmptyState
            title="No team members yet"
            description="Add your first employee or contractor. You can set their access role, pay rate, and invite them to their workspace."
            action={<TeamMemberDrawer canAssignOwner={canAssignOwner} />}
          />
        ) : (
          <div className="rounded-xl border border-border bg-surface">
            <TeamTable rows={members} />
          </div>
        )}
      </main>
    </>
  );
}
