import { Heading, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';

export type InviteEmailProps = {
  recipientName: string;
  inviteUrl: string;
};

export default function InviteEmail(props: InviteEmailProps) {
  const { recipientName, inviteUrl } = props;
  return (
    <BaseLayout
      preview="You've been invited to the LuxWeb Studio portal"
    >
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        Portal invite
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Welcome, {recipientName.split(' ')[0] || 'there'}.
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        You&apos;ve been invited to the LuxWeb Studio client portal. From there
        you can review proposals, track milestones, download files, and pay
        invoices.
      </Text>

      <div style={{ height: 20 }} />
      <EmailButton href={inviteUrl}>Accept invite</EmailButton>

      <Text className="mt-6 text-sm text-ink-muted">
        This link expires in 24 hours. If you didn&apos;t expect this, you can
        safely ignore it.
      </Text>
    </BaseLayout>
  );
}

export function inviteSubject() {
  return "You're invited to the LuxWeb Studio portal";
}
