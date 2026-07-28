import { redirect } from 'next/navigation';
import { Topbar } from '@/components/admin/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { getSession } from '@/lib/supabase/session';
import { hasCapability } from '@/lib/auth/permissions';
import { getProspects, getSetterOptions } from '@/lib/queries/outreach';
import { ProspectList } from '@/components/outreach/prospect-list';
import { OutreachSetterFilter } from '@/components/admin/outreach/setter-filter';

export default async function AdminOutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ setter?: string }>;
}) {
  const session = await getSession();
  if (!session || !hasCapability(session.role, 'manage_outreach')) {
    redirect('/admin/dashboard');
  }

  const sp = await searchParams;
  const setterId = typeof sp.setter === 'string' && sp.setter ? sp.setter : undefined;

  const [prospects, setters] = await Promise.all([
    getProspects({ setterId }),
    getSetterOptions(),
  ]);

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-4xl space-y-8 px-6 pb-16 pt-10 md:px-10">
        <PageHeader
          eyebrow="Pipeline"
          title="Outreach"
          description="Your setters' call lists. The live scorecard and appointments land here next."
          actions={
            setters.length > 0 ? (
              <OutreachSetterFilter setters={setters} current={setterId ?? ''} />
            ) : undefined
          }
        />
        <ProspectList prospects={prospects} mode="owner" />
      </main>
    </>
  );
}
