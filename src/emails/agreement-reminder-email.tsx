import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';
import { formatDateLong } from '@/lib/formatters';
import type { ReminderKind } from '@/lib/agreements/reminders';

export type AgreementReminderEmailProps = {
  recipientName: string;
  kind: ReminderKind;
  title: string;
  expiresAt: string | null;
  contractUrl: string;
};

const LEAD: Record<ReminderKind, string> = {
  unopened: "Just making sure this didn't get buried — your agreement is ready whenever you are.",
  unsigned: "Your agreement is still waiting on your signature. If anything in it doesn't look right, you can ask for changes right from the page.",
  expiring: 'Your agreement expires soon. Once it does, we’ll need to send a fresh one.',
};

/** A gentle nudge about an agreement waiting on the client's signature. */
export default function AgreementReminderEmail(props: AgreementReminderEmailProps) {
  const { recipientName, kind, title, expiresAt, contractUrl } = props;
  return (
    <BaseLayout preview={kind === 'expiring' ? `Expiring soon: ${title}` : `Waiting on you: ${title}`}>
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        {kind === 'expiring' ? 'Expiring soon' : 'Reminder'}
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {recipientName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        {LEAD[kind]}
      </Text>
      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 text-sm text-ink">
          <strong>{title}</strong>
        </Text>
        {expiresAt ? (
          <Text className="mb-0 mt-2 text-sm text-ink-muted">
            Open until {formatDateLong(expiresAt)}.
          </Text>
        ) : null}
      </Section>
      <EmailButton href={contractUrl}>Review &amp; sign</EmailButton>
    </BaseLayout>
  );
}

export function agreementReminderSubject(p: Pick<AgreementReminderEmailProps, 'kind' | 'title'>) {
  return p.kind === 'expiring' ? `Expiring soon: ${p.title}` : `Reminder: ${p.title} is ready to sign`;
}
