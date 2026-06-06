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
        You&apos;ve been invited to the LuxWeb Studio client portal — where you
        can review proposals, track milestones, download files, and pay
        invoices.
      </Text>
      <Text className="mt-3 text-base leading-relaxed text-ink">
        No password to set up: the button below signs you straight in. After
        that, you&apos;ll get back in any time with a one-tap email link or your
        Google account.
      </Text>

      <div style={{ height: 20 }} />
      <EmailButton href={inviteUrl}>Open your portal</EmailButton>

      <Text className="mt-6 text-sm text-ink-muted">
        This is a one-time sign-in link. If it&apos;s expired by the time you
        open it, just reply and we&apos;ll send a fresh one. If you didn&apos;t
        expect this, you can safely ignore it.
      </Text>
    </BaseLayout>
  );
}

export function inviteSubject() {
  return "You're invited to the LuxWeb Studio portal";
}
