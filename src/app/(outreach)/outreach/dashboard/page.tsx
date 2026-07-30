import { redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import {
  getProspects,
  getSetterScorecard,
  getOutreachSettings,
  getAppointments,
  getSetterEarnings,
} from '@/lib/queries/outreach';
import { PageHeader } from '@/components/ui/page-header';
import { buttonVariants } from '@/components/ui/button';
import { SectionHead } from '@/components/ui/section-head';
import { ProspectDrawer } from '@/components/outreach/prospect-drawer';
import { ProspectList } from '@/components/outreach/prospect-list';
import { ProspectLookup } from '@/components/outreach/prospect-lookup';
import { AppointmentList } from '@/components/outreach/appointment-list';
import { Scorecard } from '@/components/outreach/scorecard';
import { EarningsCard } from '@/components/outreach/earnings-card';
import { OutreachImportButton } from '@/components/outreach/import-button';

export default async function OutreachDashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // The working queue — callbacks due first, dead/converted hidden.
  const [prospects, scorecard, settings, appointments, earnings] = await Promise.all([
    getProspects({ setterId: session.userId, activeOnly: true, withHistory: true }),
    getSetterScorecard(session.userId),
    getOutreachSettings(),
    getAppointments({ setterId: session.userId }),
    getSetterEarnings(session.userId),
  ]);
  // Rendered once on the server so due badges and local times don't drift
  // between the server and client render.
  const nowIso = new Date().toISOString();

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
      <div className="mt-6 space-y-4">
        <Scorecard
          today={scorecard.today}
          week={scorecard.week}
          settings={settings}
        />
        <EarningsCard earnings={earnings} commissionRate={settings.commissionRate} />
      </div>
      {appointments.length > 0 ? (
        <div className="mt-8 space-y-3">
          <SectionHead number="01" title="Your appointments" size="md" />
          <AppointmentList appointments={appointments} mode="setter" />
        </div>
      ) : null}

      <div className="mt-8 space-y-3">
        <SectionHead number={appointments.length > 0 ? '02' : '01'} title="Call list" size="md" />
        <ProspectLookup />
        <ProspectList prospects={prospects} mode="setter" nowIso={nowIso} />
      </div>
    </div>
  );
}
