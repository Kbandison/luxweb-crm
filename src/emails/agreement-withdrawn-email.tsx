import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';

export type AgreementWithdrawnEmailProps = {
  recipientName: string;
  title: string;
  reason: string;
  /** True when the agreement had been signed — i.e. it's been voided. */
  wasSigned: boolean;
  portalUrl: string;
};

/**
 * Tells the client an agreement they were sent (or signed) is no longer in
 * effect, and why — so a link in their inbox doesn't quietly stop working.
 */
export default function AgreementWithdrawnEmail(props: AgreementWithdrawnEmailProps) {
  const { recipientName, title, reason, wasSigned, portalUrl } = props;
  return (
    <BaseLayout
      preview={wasSigned ? `Your agreement for ${title} was voided` : `We've withdrawn the agreement for ${title}`}
    >
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        {wasSigned ? 'Agreement voided' : 'Agreement withdrawn'}
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {recipientName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        {wasSigned ? (
          <>
            The signed agreement for <strong>{title}</strong> has been voided
            and is no longer in effect.
          </>
        ) : (
          <>
            We&apos;ve withdrawn the agreement we sent for <strong>{title}</strong>,
            so there&apos;s nothing to sign for now. If we&apos;re sending an
            updated version, it&apos;ll arrive shortly.
          </>
        )}
      </Text>

      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 text-xs uppercase tracking-[0.2em] text-ink-muted">Reason</Text>
        <Text className="mb-0 mt-2 text-sm leading-relaxed text-ink">{reason}</Text>
      </Section>

      <Text className="text-sm text-ink-muted">
        Questions? Just reply to this email.
      </Text>
      <EmailButton href={portalUrl}>Open your portal</EmailButton>
    </BaseLayout>
  );
}

export function agreementWithdrawnSubject(p: Pick<AgreementWithdrawnEmailProps, 'title' | 'wasSigned'>) {
  return p.wasSigned ? `Agreement voided: ${p.title}` : `Agreement withdrawn: ${p.title}`;
}
