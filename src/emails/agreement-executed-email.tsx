import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';

export type AgreementExecutedEmailProps = {
  recipientName: string;
  title: string;
  /** "client" gets the thank-you; "studio" gets the filing copy. */
  audience: 'client' | 'studio';
  clientName: string;
  bodySha256: string | null;
  agreementUrl: string;
};

/**
 * The fully signed agreement, as a PDF attachment, to both parties. The
 * client keeps a copy of exactly what they signed; the studio inbox keeps
 * the filing copy.
 */
export default function AgreementExecutedEmail(props: AgreementExecutedEmailProps) {
  const { recipientName, title, audience, clientName, bodySha256, agreementUrl } = props;
  return (
    <BaseLayout preview={`Signed: ${title}`}>
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        Agreement signed
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {recipientName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        {audience === 'client' ? (
          <>
            Thanks for signing. Your copy of the agreement for <strong>{title}</strong>,
            signed by both of us, is attached for your records.
          </>
        ) : (
          <>
            <strong>{clientName}</strong> signed the agreement for <strong>{title}</strong>.
            The executed copy is attached for filing.
          </>
        )}
      </Text>
      {bodySha256 ? (
        <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
          <Text className="m-0 text-xs uppercase tracking-[0.2em] text-ink-muted">
            Document fingerprint (SHA-256)
          </Text>
          <Text className="mb-0 mt-2 break-all font-mono text-xs text-ink">{bodySha256}</Text>
        </Section>
      ) : null}
      <EmailButton href={agreementUrl}>View it online</EmailButton>
    </BaseLayout>
  );
}

export function agreementExecutedSubject(p: Pick<AgreementExecutedEmailProps, 'title'>) {
  return `Signed: ${p.title}`;
}
