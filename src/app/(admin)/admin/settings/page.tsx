import { redirect } from 'next/navigation';
import { Topbar } from '@/components/admin/topbar';
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
      <Topbar title="Settings" />

      <main className="mx-auto w-full max-w-4xl px-6 pb-16 pt-10 md:px-10">
        <header className="mb-8 space-y-2">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-copper">
            Workspace
          </p>
          <h1 className="font-display text-3xl font-medium tracking-tight text-ink md:text-4xl">
            Settings
          </h1>
          <p className="font-sans text-sm text-ink-muted">
            Your admin profile, notification preferences, and integration
            status.
          </p>
          <div className="copper-rule mt-5 h-px w-24" />
        </header>

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
