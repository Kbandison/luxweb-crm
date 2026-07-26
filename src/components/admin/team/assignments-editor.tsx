'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import type { AssignableProject, MemberAssignment } from '@/lib/queries/team';

/**
 * Manage a member's project assignments — the access backbone for the
 * contractor portal. Add pairs (project + optional role), remove existing
 * ones. `assignableProjects` is the set not already assigned.
 */
export function AssignmentsEditor({
  teamMemberId,
  assignments,
  assignableProjects,
}: {
  teamMemberId: string;
  assignments: MemberAssignment[];
  assignableProjects: AssignableProject[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [roleOnProject, setRoleOnProject] = useState('');

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!projectId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/team/${teamMemberId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          role_on_project: roleOnProject.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't assign", body.error ?? 'Try again.');
        return;
      }
      setProjectId('');
      setRoleOnProject('');
      toast.success('Assigned', 'Member added to the project.');
      router.refresh();
    } catch {
      toast.error("Couldn't assign", 'Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(assignmentId: string) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/team/${teamMemberId}/assignments/${assignmentId}`,
        { method: 'DELETE' },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't remove", body.error ?? 'Try again.');
        return;
      }
      toast.success('Removed', 'Member unassigned from the project.');
      router.refresh();
    } catch {
      toast.error("Couldn't remove", 'Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {assignments.length === 0 ? (
        <EmptyState
          title="No project assignments"
          description="Assign this member to a project so they can see it in their workspace."
        />
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border">
          {assignments.map((a) => (
            <li
              key={a.assignmentId}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/projects/${a.projectId}`}
                  className="font-medium text-ink hover:text-copper"
                >
                  {a.projectName}
                </Link>
                {a.roleOnProject ? (
                  <span className="mt-0.5 block font-sans text-xs text-ink-subtle">
                    {a.roleOnProject}
                  </span>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(a.assignmentId)}
                disabled={busy}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {assignableProjects.length > 0 ? (
        <form
          onSubmit={add}
          className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-surface/60 p-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
            <label
              htmlFor="assign_project"
              className="block font-sans text-xs font-medium tracking-wide text-ink"
            >
              Add to project
            </label>
            <select
              id="assign_project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
            >
              <option value="">Select a project…</option>
              {assignableProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 space-y-1.5">
            <label
              htmlFor="assign_role"
              className="block font-sans text-xs font-medium tracking-wide text-ink"
            >
              Role on project (optional)
            </label>
            <Input
              id="assign_role"
              value={roleOnProject}
              maxLength={120}
              onChange={(e) => setRoleOnProject(e.target.value)}
              placeholder="Lead designer…"
            />
          </div>
          <Button type="submit" size="sm" disabled={busy || !projectId}>
            Assign
          </Button>
        </form>
      ) : (
        <p className="font-sans text-xs text-ink-subtle">
          {assignments.length > 0
            ? 'Assigned to every project.'
            : 'No projects available to assign yet.'}
        </p>
      )}
    </div>
  );
}
