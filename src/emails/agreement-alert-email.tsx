import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';

export type AgreementAlertEmailProps = {
  clientName: string;
  title: string;
  /** What went wrong, in a sentence. */
  problem: string;
  /** The underlying error, for the record. */
  detail: string;
  contractUrl: string;
};

/**
 * Internal alert: a client signed, but something that should follow the
 * signature (raising the deposit invoice) failed. The signature stands; the
 * contract page has a button to retry.
 */
export default function AgreementAlertEmail(props: AgreementAlertEmailProps) {
  const { clientName, title, problem, detail, contractUrl } = props;
  return (
    <BaseLayout preview={`Needs attention — ${title}`}>
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-[#B91C1C]">
        Needs attention
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        {clientName || 'A client'} signed — {problem}
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        The agreement for <strong>{title}</strong> is signed. Open it and use
        <strong> Finish setup</strong> to retry.
      </Text>
      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 font-mono text-xs leading-relaxed text-ink-muted">{detail}</Text>
      </Section>
      <EmailButton href={contractUrl}>Open the agreement</EmailButton>
    </BaseLayout>
  );
}

export function agreementAlertSubject(p: Pick<AgreementAlertEmailProps, 'title' | 'problem'>) {
  return `Needs attention: ${p.title} — ${p.problem}`;
}
