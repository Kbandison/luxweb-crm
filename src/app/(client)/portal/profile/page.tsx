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

      <section className="mt-12 space-y-3">
        <h2 className="font-display text-lg font-medium text-ink">
          Your data
        </h2>
        <p className="font-sans text-sm text-ink-muted">
          Download a JSON file containing your profile, projects, invoices,
          proposals, contracts, milestones, and visible files. Limited to 5
          exports per hour.
        </p>
        <a
          href="/api/client/export"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-meta text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
        >
          Download my data
        </a>
      </section>
    </main>
  );
}
