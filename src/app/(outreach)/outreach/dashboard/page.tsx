import { redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getProspects } from '@/lib/queries/outreach';
import { PageHeader } from '@/components/ui/page-header';
import { ProspectDrawer } from '@/components/outreach/prospect-drawer';
import { ProspectList } from '@/components/outreach/prospect-list';

export default async function OutreachDashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // The working queue — callbacks due first, dead/converted hidden.
  const prospects = await getProspects({
    setterId: session.userId,
    activeOnly: true,
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-16 pt-10 md:px-10">
      <PageHeader
        eyebrow="Outreach"
        title="Your call list"
        description="Callbacks due first. Log every dial — tap the number to call, pick an outcome."
        actions={<ProspectDrawer />}
      />
      <div className="mt-8">
        <ProspectList prospects={prospects} mode="setter" />
      </div>
    </div>
  );
}
