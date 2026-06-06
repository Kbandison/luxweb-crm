import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';
import { formatUSD } from '@/lib/formatters';

export type PaymentAlertEmailProps = {
  kind: 'received' | 'overdue';
  clientName: string;
  description: string;
  amountCents: number;
  /** Admin dashboard URL for the invoice/project. */
  invoiceUrl?: string | null;
};

/**
 * Internal money alert for the studio owner — "you got paid" / "a payment
 * went overdue". Distinct from the client's invoice receipt (this one sends
 * from alerts@ to the studio inbox).
 */
export default function PaymentAlertEmail(props: PaymentAlertEmailProps) {
  const { kind, clientName, description, amountCents, invoiceUrl } = props;
  const received = kind === 'received';
  const who = clientName || 'A client';
  return (
    <BaseLayout
      preview={
        received
          ? `${who} paid ${formatUSD(amountCents)}`
          : `${who}'s payment is overdue`
      }
    >
      <Text
        className={`m-0 text-xs uppercase tracking-[0.22em] ${
          received ? 'text-copper' : 'text-[#B91C1C]'
        }`}
      >
        {received ? 'Payment received' : 'Payment overdue'}
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        {received ? `${who} just paid.` : `${who}'s payment didn't go through.`}
      </Heading>

      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 text-xs uppercase tracking-[0.2em] text-ink-muted">
          {description}
        </Text>
        <Text className="mt-2 text-3xl font-medium tracking-tight text-ink">
          {formatUSD(amountCents)}
        </Text>
      </Section>

      {invoiceUrl ? (
        <>
          <div style={{ height: 20 }} />
          <EmailButton href={invoiceUrl}>Open in dashboard</EmailButton>
        </>
      ) : null}
    </BaseLayout>
  );
}

export function paymentAlertSubject(p: PaymentAlertEmailProps) {
  const who = p.clientName || 'a client';
  return p.kind === 'received'
    ? `Payment received — ${who}`
    : `Payment overdue — ${who}`;
}
