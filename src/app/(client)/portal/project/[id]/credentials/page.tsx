import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientProjectCredentials } from '@/lib/queries/client';
import { ClientCredentialsList } from '@/components/client/credentials/client-credentials-list';
import { SectionHead } from '@/components/ui/section-head';

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
      <SectionHead
        title="Credentials"
        description="Logins and keys for this project. Add your own (e.g. hosting, domain registrar) so the team can pick them up. Reveals are logged."
      />
      <ClientCredentialsList projectId={id} items={items} />
    </main>
  );
}
