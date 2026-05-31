import { InviteForm } from './invite-form';

export default async function AcceptInvitePage({
  searchParams,
}: {
  // `type` is 'invite' for a first-time invite, 'magiclink' for a resend
  // (generateLink('invite') 422s once the auth user exists, so resends use
  // a magic link). Both must be honored when verifying the token.
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash, type } = await searchParams;
  return <InviteForm tokenHash={token_hash ?? null} type={type ?? null} />;
}
