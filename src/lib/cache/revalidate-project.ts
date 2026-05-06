import 'server-only';
import { revalidatePath } from 'next/cache';

/**
 * Invalidate every cached page under a project's admin AND client subtree
 * after a mutation. Forces both portals to re-fetch on next render
 * (router.refresh from the client triggers the re-fetch; this clears the
 * server cache so the re-fetch returns fresh data).
 *
 * Use this after any mutation that affects what either side sees on
 * project pages: milestone status changes, review submissions/approvals,
 * file uploads, message sends, etc.
 *
 * Pass a layout-level revalidation so all sub-routes (overview, files,
 * agreement, invoices, milestones, revisions, etc.) refresh together.
 */
export function revalidateProject(projectId: string): void {
  revalidatePath(`/admin/projects/${projectId}`, 'layout');
  revalidatePath(`/portal/project/${projectId}`, 'layout');
  // Also drop the dashboards since they pull the same project data.
  revalidatePath('/admin/dashboard');
  revalidatePath('/portal/dashboard');
}
