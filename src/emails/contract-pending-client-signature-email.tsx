import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';
import { formatDateLong } from '@/lib/formatters';

export type ContractPendingClientSignatureEmailProps = {
  recipientName: string;
  contractUrl: string;
  /** The agreement's title, e.g. "Aurora Dental site build". */
  title?: string;
  /** When the offer lapses — shown so the client knows there's a window. */
  expiresAt?: string | null;
};

/**
 * "Your agreement is ready to sign." Sent when the studio signs and sends an
 * agreement — the client reviews the summary and the full terms, signs once,
 * and pays the deposit in the same sitting.
 */
export default function ContractPendingClientSignatureEmail(
  props: ContractPendingClientSignatureEmailProps,
) {
  const { recipientName, contractUrl, title, expiresAt } = props;
  return (
    <BaseLayout preview="Your LuxWeb agreement is ready to sign">
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        Agreement ready
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {recipientName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        {title ? (
          <>
            Your agreement for <strong>{title}</strong> is ready.
          </>
        ) : (
          <>Your agreement is ready.</>
        )}{' '}
        We&apos;ve already signed it — it&apos;s waiting on your signature.
      </Text>

      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 text-sm leading-relaxed text-ink-muted">
          You&apos;ll see a short summary of what we&apos;re building, the
          timeline, and the payment schedule, followed by the full terms. Sign
          once, and if there&apos;s a deposit you can pay it right there.
        </Text>
        {expiresAt ? (
          <Text className="mb-0 mt-3 text-sm text-ink">
            This offer is open until <strong>{formatDateLong(expiresAt)}</strong>.
          </Text>
        ) : null}
      </Section>

      <EmailButton href={contractUrl}>Review &amp; sign</EmailButton>
    </BaseLayout>
  );
}

export function contractPendingClientSignatureSubject(
  p?: Pick<ContractPendingClientSignatureEmailProps, 'title'>,
) {
  return p?.title
    ? `Ready to sign: ${p.title}`
    : 'Your LuxWeb agreement is ready to sign';
}
