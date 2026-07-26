import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/components/admin/topbar';
import { SectionHead } from '@/components/ui/section-head';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { getSession } from '@/lib/supabase/session';
import { hasCapability, ROLE_LABELS } from '@/lib/auth/permissions';
import {
  getTeamMember,
  getMemberAssignments,
  getAssignableProjects,
  getTeamMemberAccessStatus,
} from '@/lib/queries/team';
import { formatDate } from '@/lib/formatters';
import {
  EMPLOYMENT_LABEL,
  ROLE_TONE,
  STATUS_TONE,
  formatRate,
} from '@/components/admin/team/team-meta';
import { TeamMemberDrawer } from '@/components/admin/team/team-member-drawer';
import { InviteTeamMemberButton } from '@/components/admin/team/invite-team-member-button';
import { RemoveTeamMemberButton } from '@/components/admin/team/remove-team-member-button';
import { AssignmentsEditor } from '@/components/admin/team/assignments-editor';

const ACCESS_LABEL = {
  none: 'Not invited',
  invited: 'Invited · pending',
  active: 'Workspace access',
} as const;

const ACCESS_TONE = {
  none: 'bg-surface-2 text-ink-subtle',
  invited: 'bg-warning/15 text-warning',
  active: 'bg-success/15 text-success',
} as const;

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || !hasCapability(session.role, 'manage_team')) {
    redirect('/admin/dashboard');
  }
  const canAssignOwner = hasCapability(session.role, 'assign_owner_role');

  const { id } = await params;
  const member = await getTeamMember(id);
  if (!member) notFound();

  const [assignments, assignableProjects, accessStatus] = await Promise.all([
    getMemberAssignments(id),
    getAssignableProjects(id),
    getTeamMemberAccessStatus(member.userId),
  ]);

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-5xl space-y-10 px-6 pb-16 pt-10 md:px-10">
        {/* Header */}
        <header className="space-y-4">
          <Link
            href="/admin/team"
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-meta text-ink-subtle transition-colors hover:text-copper"
          >
            ← Team
          </Link>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <h1 className="font-display text-3xl font-medium tracking-tight text-ink md:text-4xl">
                {member.fullName}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  label={ROLE_LABELS[member.role]}
                  tone={ROLE_TONE[member.role]}
                />
                <StatusPill
                  label={EMPLOYMENT_LABEL[member.employmentType]}
                  tone="bg-surface-2 text-ink-muted"
                />
                <StatusPill
                  label={member.status}
                  tone={STATUS_TONE[member.status]}
                  size="sm"
                />
                {member.title ? (
                  <span className="font-sans text-sm text-ink-muted">
                    {member.title}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <InviteTeamMemberButton
                teamMemberId={member.id}
                hasEmail={Boolean(member.email)}
                accessStatus={accessStatus}
              />
              <TeamMemberDrawer
                member={member}
                canAssignOwner={canAssignOwner}
                triggerLabel="Edit"
                triggerVariant="secondary"
              />
              <RemoveTeamMemberButton
                teamMemberId={member.id}
                fullName={member.fullName}
                hasLogin={Boolean(member.userId)}
              />
            </div>
          </div>
          <div className="copper-rule h-px w-24" />
        </header>

        {/* Profile + compensation */}
        <section className="grid gap-4 md:grid-cols-2">
          <Card padding="lg" className="space-y-4">
            <SectionHead title="Profile" size="md" />
            <dl className="space-y-3 text-sm">
              <Field label="Email" value={member.email ?? '—'} />
              <Field label="Phone" value={member.phone ?? '—'} />
              <Field
                label="Access"
                value={
                  <StatusPill
                    label={ACCESS_LABEL[accessStatus]}
                    tone={ACCESS_TONE[accessStatus]}
                    size="sm"
                  />
                }
              />
              <Field label="Added" value={formatDate(member.createdAt)} />
            </dl>
          </Card>

          <Card padding="lg" className="space-y-4">
            <SectionHead
              title="Compensation"
              description="Admin-only. Never shown to the team member."
              size="md"
            />
            <dl className="space-y-3 text-sm">
              <Field
                label="Pay rate"
                value={
                  <span className="tabular-nums">
                    {formatRate(member.rateCents, member.rateType)}
                  </span>
                }
              />
              <Field
                label="Type"
                value={EMPLOYMENT_LABEL[member.employmentType]}
              />
            </dl>
            {member.notes ? (
              <div className="border-t border-border/60 pt-3">
                <p className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                  Notes
                </p>
                <p className="mt-1.5 whitespace-pre-wrap font-sans text-sm text-ink-muted">
                  {member.notes}
                </p>
              </div>
            ) : null}
          </Card>
        </section>

        {/* Assignments */}
        <section className="space-y-4">
          <SectionHead
            number="01"
            title="Project assignments"
            description="The projects this member can see in their workspace."
          />
          <AssignmentsEditor
            teamMemberId={member.id}
            assignments={assignments}
            assignableProjects={assignableProjects}
          />
        </section>
      </main>
    </>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
        {label}
      </dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
