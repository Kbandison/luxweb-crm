import { redirect } from 'next/navigation';
import { Topbar } from '@/components/admin/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { getSession } from '@/lib/supabase/session';
import { hasCapability } from '@/lib/auth/permissions';
import {
  getProspects,
  getSetterOptions,
  getOwnerScorecard,
} from '@/lib/queries/outreach';
import { ProspectList } from '@/components/outreach/prospect-list';
import { Scorecard } from '@/components/outreach/scorecard';
import { SectionHead } from '@/components/ui/section-head';
import { buttonVariants } from '@/components/ui/button';
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

  const [prospects, setters, scorecard] = await Promise.all([
    getProspects({ setterId }),
    getSetterOptions(),
    getOwnerScorecard(),
  ]);
  const pctFmt = (n: number) => `${Math.round(n * 100)}%`;

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
              <a
                href={`/api/outreach/prospects/export.csv${setterId ? `?setter=${setterId}` : ''}`}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                Export
              </a>
            </>
          }
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

        <SectionHead number="02" title="Call list" size="md" />
        <ProspectList prospects={prospects} mode="owner" />
      </main>
    </>
  );
}
