import { redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import {
  getProspects,
  getSetterScorecard,
  getOutreachSettings,
} from '@/lib/queries/outreach';
import { PageHeader } from '@/components/ui/page-header';
import { buttonVariants } from '@/components/ui/button';
import { ProspectDrawer } from '@/components/outreach/prospect-drawer';
import { ProspectList } from '@/components/outreach/prospect-list';
import { Scorecard } from '@/components/outreach/scorecard';
import { OutreachImportButton } from '@/components/outreach/import-button';

export default async function OutreachDashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // The working queue — callbacks due first, dead/converted hidden.
  const [prospects, scorecard, settings] = await Promise.all([
    getProspects({ setterId: session.userId, activeOnly: true }),
    getSetterScorecard(session.userId),
    getOutreachSettings(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-16 pt-10 md:px-10">
      <PageHeader
        eyebrow="Outreach"
        title="Your call list"
        description="Callbacks due first. Log every dial — tap the number to call, pick an outcome."
        actions={
          <>
            <OutreachImportButton />
            <a
              href="/api/outreach/prospects/export.csv"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Export
            </a>
            <ProspectDrawer />
          </>
        }
      />
      <div className="mt-6">
        <Scorecard
          today={scorecard.today}
          week={scorecard.week}
          settings={settings}
        />
      </div>
      <div className="mt-8">
        <ProspectList prospects={prospects} mode="setter" />
      </div>
    </div>
  );
}
