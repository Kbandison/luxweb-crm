import { redirect } from 'next/navigation';
import { Topbar } from '@/components/admin/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { getSession } from '@/lib/supabase/session';
import { getClientProfile } from '@/lib/queries/client';
import { AdminSettingsTabs } from '@/components/admin/settings/settings-tabs';

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const session = await getSession();
  if (!session) redirect('/login');

  const profile = await getClientProfile(session.userId);
  const integrations = readIntegrationStatus();

  return (
    <>
      <Topbar />

      <main className="mx-auto w-full max-w-4xl px-6 pb-16 pt-10 md:px-10">
        <PageHeader
          eyebrow="Workspace"
          title="Settings"
          description="Your admin profile, notification preferences, and integration status."
          className="mb-8"
        />

        <AdminSettingsTabs
          initialTab={tab === 'notifications' || tab === 'integrations' ? tab : 'profile'}
          initialFullName={profile?.fullName ?? ''}
          email={profile?.email ?? session.email}
          initialPrefs={profile?.emailPrefs ?? {}}
          integrations={integrations}
        />
      </main>
    </>
  );
}

function readIntegrationStatus() {
  return {
    supabase: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    stripe: Boolean(
      process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
    ),
    resend: Boolean(process.env.RESEND_API_KEY),
  };
}
