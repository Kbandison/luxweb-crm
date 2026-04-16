import { Heading, Hr, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';

export type NewLeadEmailProps = {
  recipientName: string;
  fullName: string;
  email: string | null;
  company: string | null;
  source: string | null;
  message: string | null;
  leadUrl: string;
};

export default function NewLeadEmail(props: NewLeadEmailProps) {
  const { recipientName, fullName, email, company, source, message, leadUrl } =
    props;
  return (
    <BaseLayout preview={`New lead — ${fullName}${company ? ` from ${company}` : ''}`}>
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        New lead
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {recipientName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        Someone reached out through the website.
      </Text>

      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 text-base font-medium text-ink">{fullName}</Text>
        {company ? (
          <Text className="mt-1 text-sm text-ink-muted">{company}</Text>
        ) : null}
        {email ? (
          <Text className="mt-2 text-sm font-mono text-ink">{email}</Text>
        ) : null}
        {source ? (
          <Text className="mt-1 text-xs uppercase tracking-[0.16em] text-ink-muted">
            Source · {source}
          </Text>
        ) : null}
        {message ? (
          <>
            <Hr className="my-4 border-border" />
            <Text className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {message}
            </Text>
          </>
        ) : null}
      </Section>

      <EmailButton href={leadUrl}>Open lead</EmailButton>

      <Text className="mt-6 text-sm text-ink-muted">
        The lead is already in your inbox — reply from there to keep everything
        tied to the contact record.
      </Text>
    </BaseLayout>
  );
}

export function newLeadSubject(p: NewLeadEmailProps) {
  return `New lead · ${p.fullName}${p.company ? ` (${p.company})` : ''}`;
}
