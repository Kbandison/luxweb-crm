import { redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getProspects, getOutreachSettings } from '@/lib/queries/outreach';
import { PageHeader } from '@/components/ui/page-header';
import { DialMode } from '@/components/outreach/dial-mode';

/** Focused dialing — the working queue, one prospect at a time. */
export default async function OutreachDialPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [prospects, settings] = await Promise.all([
    getProspects({ setterId: session.userId, activeOnly: true, withHistory: true }),
    getOutreachSettings(),
  ]);
  const nowIso = new Date().toISOString();

  return (
    <div className="mx-auto w-full max-w-2xl px-6 pb-16 pt-10 md:px-10">
      <PageHeader
        eyebrow="Outreach"
        title="Dial mode"
        description="Callbacks first. Pick an outcome and it moves to the next one."
      />
      <div className="mt-6">
        <DialMode
          prospects={prospects}
          nowIso={nowIso}
          homeZone={settings.slotTimezone}
          script={settings.callScript}
          objections={settings.objectionNotes}
        />
      </div>
    </div>
  );
}
