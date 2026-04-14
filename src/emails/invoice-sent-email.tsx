import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';
import { formatDate, formatUSD } from '@/lib/formatters';

export type InvoiceSentEmailProps = {
  recipientName: string;
  description: string;
  amountCents: number;
  dueDate?: string | null;
  hostedInvoiceUrl: string;
};

export default function InvoiceSentEmail(props: InvoiceSentEmailProps) {
  const { recipientName, description, amountCents, dueDate, hostedInvoiceUrl } =
    props;
  return (
    <BaseLayout
      preview={`New invoice from LuxWeb Studio — ${formatUSD(amountCents)}`}
    >
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        New invoice
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {recipientName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        Your invoice is ready for payment.
      </Text>

      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 text-xs uppercase tracking-[0.2em] text-ink-muted">
          {description}
        </Text>
        <Text className="mt-2 text-3xl font-medium tracking-tight text-ink">
          {formatUSD(amountCents)}
        </Text>
        {dueDate ? (
          <Text className="mt-1 text-xs uppercase tracking-[0.16em] text-ink-muted">
            Due {formatDate(dueDate)}
          </Text>
        ) : null}
      </Section>

      <EmailButton href={hostedInvoiceUrl}>Pay invoice</EmailButton>

      <Text className="mt-6 text-sm text-ink-muted">
        Pay by card or ACH. Payment is processed securely through Stripe.
      </Text>
    </BaseLayout>
  );
}

export function invoiceSentSubject(p: InvoiceSentEmailProps) {
  return `Invoice · ${formatUSD(p.amountCents)} · ${p.description}`;
}
