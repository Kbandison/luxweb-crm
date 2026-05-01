import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientProjectCredentials } from '@/lib/queries/client';
import { ClientCredentialsList } from '@/components/client/credentials/client-credentials-list';

export default async function ClientProjectCredentialsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');
  const items = await getClientProjectCredentials(id, session.userId);
  if (items === null) notFound();

  return (
    <main className="space-y-6 px-6 py-10 md:px-10">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-medium text-ink">
          Credentials
        </h1>
        <p className="font-sans text-sm text-ink-muted">
          Logins and keys for this project. Add your own (e.g. hosting,
          domain registrar) so the team can pick them up. Reveals are logged.
        </p>
      </header>
      <ClientCredentialsList projectId={id} items={items} />
    </main>
  );
}
