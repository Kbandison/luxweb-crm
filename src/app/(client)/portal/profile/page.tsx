import { redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientProfile } from '@/lib/queries/client';
import { ClientProfileForm } from '@/components/client/profile-form';
import { PageHeader } from '@/components/ui/page-header';

export default async function ClientProfilePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const profile = await getClientProfile(session.userId);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10 md:py-14">
      <PageHeader
        title="Profile"
        description="Manage your account details and email preferences."
        className="mb-10"
      />

      <ClientProfileForm
        initialFullName={profile?.fullName ?? ''}
        email={profile?.email ?? session.email}
        initialPrefs={profile?.emailPrefs ?? {}}
      />
    </main>
  );
}
