import { getProjectCredentials } from '@/lib/queries/admin';
import { CredentialsManager } from '@/components/admin/credentials/credentials-manager';

export default async function AdminProjectCredentialsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const credentials = await getProjectCredentials(id);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-8 py-8">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-medium text-ink">
          Credentials
        </h1>
        <p className="font-sans text-sm text-ink-muted">
          Encrypted vault for project logins, API keys, and secure notes.
          Toggle a credential as &ldquo;client visible&rdquo; to share it via
          the portal.
        </p>
      </header>
      <CredentialsManager
        projectId={id}
        initial={credentials.map((c) => ({
          id: c.id,
          kind: c.kind,
          label: c.label,
          username: c.username,
          url: c.url,
          notes: c.notes,
          visibleToClient: c.visibleToClient,
          createdAt: c.createdAt,
        }))}
      />
    </main>
  );
}
