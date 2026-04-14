import { redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientProfile } from '@/lib/queries/client';
import { ClientProfileForm } from '@/components/client/profile-form';

export default async function ClientProfilePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const profile = await getClientProfile(session.userId);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10 md:py-14">
      <header className="mb-10 space-y-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-copper">
          Your account
        </p>
        <h1 className="font-display text-4xl font-medium tracking-tight text-ink">
          Profile
        </h1>
        <p className="font-sans text-sm text-ink-muted">
          Manage your name and which events notify you by email.
        </p>
      </header>

      <ClientProfileForm
        initialFullName={profile?.fullName ?? ''}
        email={profile?.email ?? session.email}
        initialPrefs={profile?.emailPrefs ?? {}}
      />
    </main>
  );
}
