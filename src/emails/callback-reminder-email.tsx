import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';

export type CallbackReminderEmailProps = {
  recipientName: string;
  overdue: number;
  today: number;
  /** A few of the names, so the email is useful without opening it. */
  samples: Array<{ name: string; when: string }>;
  dialUrl: string;
};

export default function CallbackReminderEmail(props: CallbackReminderEmailProps) {
  const { recipientName, overdue, today, samples, dialUrl } = props;
  const total = overdue + today;

  return (
    <BaseLayout preview={`${total} callback${total === 1 ? '' : 's'} due today`}>
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        Callbacks
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {recipientName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        You have {total} callback{total === 1 ? '' : 's'} on the board
        {overdue > 0 ? ` — ${overdue} already past due` : ''}.
      </Text>

      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        {samples.map((s) => (
          <Text key={`${s.name}-${s.when}`} className="m-0 mt-1 text-sm text-ink">
            {s.name}
            <span className="text-ink-muted"> · {s.when}</span>
          </Text>
        ))}
        {total > samples.length ? (
          <Text className="m-0 mt-3 text-xs uppercase tracking-[0.16em] text-ink-muted">
            + {total - samples.length} more
          </Text>
        ) : null}
      </Section>

      <EmailButton href={dialUrl}>Start dialing</EmailButton>
    </BaseLayout>
  );
}

export function callbackReminderSubject(p: CallbackReminderEmailProps) {
  const total = p.overdue + p.today;
  return `${total} callback${total === 1 ? '' : 's'} due${p.overdue > 0 ? ` · ${p.overdue} overdue` : ''}`;
}
