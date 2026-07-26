import { redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getLeadsPaginated, CONTACT_SORTS } from '@/lib/queries/admin';
import { parseListParams } from '@/lib/list-params';
import { PageHeader } from '@/components/ui/page-header';
import { NewLeadDrawer } from '@/components/admin/leads/new-lead-drawer';
import { StaffLeadsList } from '@/components/staff/staff-leads-list';

export default async function StaffLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const sp = await searchParams;
  const params = parseListParams(sp, {
    defaultSort: 'created_at',
    allowedSorts: CONTACT_SORTS,
  });
  // Scoped to leads this contractor owns.
  const result = await getLeadsPaginated(params, session.userId);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pb-16 pt-10 md:px-10">
      <PageHeader
        eyebrow="Workspace"
        title="My leads"
        description="Leads you own. Add and manage your own; the studio sees them too."
        actions={<NewLeadDrawer endpoint="/api/staff/leads" />}
      />
      <div className="mt-8">
        <StaffLeadsList leads={result.rows} />
      </div>
    </div>
  );
}
