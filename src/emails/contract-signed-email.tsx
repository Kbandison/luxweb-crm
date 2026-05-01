import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';
import { formatDateTime, formatUSD } from '@/lib/formatters';

export type ContractSignedEmailProps = {
  adminName: string;
  clientName: string;
  title: string;
  totalCents: number | null;
  agreementVersion: string;
  signedAt: string;
  contractUrl: string;
};

export default function ContractSignedEmail(props: ContractSignedEmailProps) {
  const {
    adminName,
    clientName,
    title,
    totalCents,
    agreementVersion,
    signedAt,
    contractUrl,
  } = props;
  return (
    <BaseLayout preview={`${clientName} signed the ${title} contract`}>
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        Contract signed
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {adminName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        <strong>{clientName}</strong> signed the development agreement on{' '}
        {formatDateTime(signedAt)}.
      </Text>

      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 text-xs uppercase tracking-[0.2em] text-ink-muted">
          Project
        </Text>
        <Text className="mt-2 text-lg font-medium tracking-tight text-ink">
          {title}
        </Text>
        {totalCents != null && totalCents > 0 ? (
          <Text className="mt-1 text-sm text-ink-muted">
            Investment · {formatUSD(totalCents)}
          </Text>
        ) : null}
        <Text className="mt-1 text-sm text-ink-muted">
          Agreement {agreementVersion}
        </Text>
      </Section>

      <EmailButton href={contractUrl}>Open contract</EmailButton>

      <Text className="mt-6 text-sm text-ink-muted">
        Second signature captured — client has now assented to both pricing
        (proposal) and legal terms (agreement).
      </Text>
    </BaseLayout>
  );
}

export function contractSignedSubject(p: ContractSignedEmailProps) {
  return `${p.clientName} signed the contract for ${p.title}`;
}
