import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';

export type AgreementChangesRequestedEmailProps = {
  clientName: string;
  title: string;
  message: string;
  editorUrl: string;
};

/**
 * Studio alert: the client asked for changes to an agreement instead of
 * signing it. The note is quoted in full so it can be answered from the
 * inbox; Revise & resend in the editor sends the updated version.
 */
export default function AgreementChangesRequestedEmail(
  props: AgreementChangesRequestedEmailProps,
) {
  const { clientName, title, message, editorUrl } = props;
  return (
    <BaseLayout preview={`${clientName || 'A client'} asked for changes — ${title}`}>
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        Changes requested
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        {clientName || 'A client'} asked for changes
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        On the agreement for <strong>{title}</strong>:
      </Text>
      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-ink">{message}</Text>
      </Section>
      <Text className="text-sm text-ink-muted">
        It&apos;s still open for their signature. Revise &amp; resend to send an
        updated version — that withdraws this one.
      </Text>
      <EmailButton href={editorUrl}>Open the agreement</EmailButton>
    </BaseLayout>
  );
}

export function agreementChangesRequestedSubject(
  p: Pick<AgreementChangesRequestedEmailProps, 'clientName' | 'title'>,
) {
  return `Changes requested: ${p.title}${p.clientName ? ` — ${p.clientName}` : ''}`;
}
