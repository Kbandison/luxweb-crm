import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout } from './base-layout';
import { formatDate, formatUSD } from '@/lib/formatters';

export type InvoicePaidEmailProps = {
  recipientName: string;
  description: string;
  amountCents: number;
  paidAt?: string | null;
  hostedInvoiceUrl?: string | null;
};

export default function InvoicePaidEmail(props: InvoicePaidEmailProps) {
  const { recipientName, description, amountCents, paidAt, hostedInvoiceUrl } =
    props;
  return (
    <BaseLayout
      preview={`Receipt — ${formatUSD(amountCents)} received, thank you`}
    >
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        Payment received
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Thank you, {recipientName.split(' ')[0] || 'there'}.
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        We&apos;ve received your payment. This is your receipt.
      </Text>

      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 text-xs uppercase tracking-[0.2em] text-ink-muted">
          {description}
        </Text>
        <Text className="mt-2 text-3xl font-medium tracking-tight text-ink">
          {formatUSD(amountCents)}
        </Text>
        {paidAt ? (
          <Text className="mt-1 text-xs uppercase tracking-[0.16em] text-ink-muted">
            Paid {formatDate(paidAt)}
          </Text>
        ) : null}
      </Section>

      {hostedInvoiceUrl ? (
        <Text className="text-sm text-ink-muted">
          The full Stripe receipt is available at{' '}
          <a href={hostedInvoiceUrl} style={{ color: '#B45309' }}>
            this link
          </a>
          .
        </Text>
      ) : null}
    </BaseLayout>
  );
}

export function invoicePaidSubject(p: InvoicePaidEmailProps) {
  return `Receipt · ${formatUSD(p.amountCents)}`;
}
