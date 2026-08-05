import { redirect } from 'next/navigation';
import { Topbar } from '@/components/admin/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { getSession } from '@/lib/supabase/session';
import { hasCapability } from '@/lib/auth/permissions';
import {
  getProspects,
  getSetterOptions,
  getOwnerScorecard,
  getAppointments,
  getCommissionSummary,
  getOwnerUserId,
} from '@/lib/queries/outreach';
import { getGoogleConnection, googleConfigured } from '@/lib/google/calendar';
import { formatUSD } from '@/lib/formatters';
import { ProspectList } from '@/components/outreach/prospect-list';
import { ProspectLookup } from '@/components/outreach/prospect-lookup';
import { AppointmentList } from '@/components/outreach/appointment-list';
import { Scorecard } from '@/components/outreach/scorecard';
import { SectionHead } from '@/components/ui/section-head';
import { buttonVariants } from '@/components/ui/button';
import { OutreachSetterFilter } from '@/components/admin/outreach/setter-filter';
import { GoogleConnect } from '@/components/admin/outreach/google-connect';
import { OutreachSettingsDrawer } from '@/components/admin/outreach/outreach-settings-drawer';

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

  const ownerId = await getOwnerUserId();
  const [prospects, setters, scorecard, appointments, commissions, gcal] =
    await Promise.all([
      getProspects({ setterId, withHistory: true }),
      getSetterOptions(),
      getOwnerScorecard(),
      getAppointments({ setterId }),
      getCommissionSummary(),
      ownerId ? getGoogleConnection(ownerId) : Promise.resolve({ connected: false, email: null }),
    ]);
  // Server-rendered so due badges and prospect local times stay hydration-safe.
  const nowIso = new Date().toISOString();
  const pctFmt = (n: number) => `${Math.round(n * 100)}%`;
  const totalCommission = commissions.reduce((s, c) => s + c.commissionCents, 0);

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-4xl space-y-8 px-6 pb-16 pt-10 md:px-10">
        <PageHeader
          eyebrow="Pipeline"
          title="Outreach"
          description="Your setters' call lists. The live scorecard and appointments land here next."
          actions={
            <>
              {setters.length > 0 ? (
                <OutreachSetterFilter setters={setters} current={setterId ?? ''} />
              ) : null}
              <OutreachSettingsDrawer settings={scorecard.settings} />
              <a
                href={`/api/outreach/prospects/export.csv${setterId ? `?setter=${setterId}` : ''}`}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                Export
              </a>
            </>
          }
        />

        <GoogleConnect
          connected={gcal.connected}
          email={gcal.email}
          configured={googleConfigured()}
          canConnect={session.role === 'admin'}
        />

        <Scorecard
          today={scorecard.today}
          week={scorecard.week}
          settings={scorecard.settings}
        />

        {scorecard.perSetter.length > 0 ? (
          <section className="space-y-3">
            <SectionHead number="01" title="By setter" description="This week." size="md" />
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                    <th className="px-4 py-2.5 font-medium">Setter</th>
                    <th className="px-4 py-2.5 text-right font-medium">Dials</th>
                    <th className="px-4 py-2.5 text-right font-medium">Convos</th>
                    <th className="px-4 py-2.5 text-right font-medium">Booked</th>
                    <th className="px-4 py-2.5 text-right font-medium">Contact %</th>
                    <th className="px-4 py-2.5 text-right font-medium">Book %</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecard.perSetter.map((s) => (
                    <tr key={s.setterId} className="border-b border-border/60">
                      <td className="px-4 py-2.5 font-medium text-ink">{s.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{s.dials}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{s.conversations}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{s.booked}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{pctFmt(s.contactRate)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{pctFmt(s.bookRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <SectionHead
            number="02"
            title="Appointments"
            description="Mark showed + result to record commission."
            size="md"
            right={
              totalCommission > 0 ? (
                <span className="font-mono text-sm tabular-nums text-success">
                  {formatUSD(totalCommission)} commission
                </span>
              ) : undefined
            }
          />
          <AppointmentList appointments={appointments} mode="owner" />
          {commissions.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                    <th className="px-4 py-2.5 font-medium">Setter</th>
                    <th className="px-4 py-2.5 text-right font-medium">Won</th>
                    <th className="px-4 py-2.5 text-right font-medium">Deal value</th>
                    <th className="px-4 py-2.5 text-right font-medium">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((c) => (
                    <tr key={c.setterId} className="border-b border-border/60">
                      <td className="px-4 py-2.5 font-medium text-ink">{c.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{c.wonCount}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{formatUSD(c.dealValueCents)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-success">{formatUSD(c.commissionCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <SectionHead number="03" title="Call list" size="md" />
        <ProspectLookup />
        <ProspectList
          prospects={prospects}
          mode="owner"
          nowIso={nowIso}
          homeZone={scorecard.settings.slotTimezone}
          setters={setters}
        />
      </main>
    </>
  );
}
