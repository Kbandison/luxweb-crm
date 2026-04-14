import { InviteForm } from './invite-form';

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string }>;
}) {
  const { token_hash } = await searchParams;
  return <InviteForm tokenHash={token_hash ?? null} />;
}
