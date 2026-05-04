import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';

export type ContractPendingClientSignatureEmailProps = {
  recipientName: string;
  contractUrl: string;
};

export default function ContractPendingClientSignatureEmail(
  props: ContractPendingClientSignatureEmailProps,
) {
  const { recipientName, contractUrl } = props;
  return (
    <BaseLayout preview="Your LuxWeb agreement is ready to sign">
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        Agreement ready
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {recipientName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        We&apos;ve counter-signed the development agreement. It&apos;s ready
        for your signature whenever you&apos;re set.
      </Text>

      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 text-sm leading-relaxed text-ink-muted">
          Once you sign, we&apos;ll send the deposit invoice and kick the
          project off.
        </Text>
      </Section>

      <EmailButton href={contractUrl}>Review &amp; sign</EmailButton>
    </BaseLayout>
  );
}

export function contractPendingClientSignatureSubject() {
  return 'Your LuxWeb agreement is ready to sign';
}
