import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';
import { formatDate, formatUSD } from '@/lib/formatters';

export type InvoiceOverdueEmailProps = {
  recipientName: string;
  description: string;
  amountCents: number;
  dueDate?: string | null;
  /** In-portal pay URL — present for client recipients, null for admin. */
  payUrl?: string | null;
};

export default function InvoiceOverdueEmail(props: InvoiceOverdueEmailProps) {
  const { recipientName, description, amountCents, dueDate, payUrl } = props;
  return (
    <BaseLayout
      preview={`Past due — ${formatUSD(amountCents)} invoice needs attention`}
    >
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        Past due
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {recipientName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        A quick reminder that the invoice below is past its due date. If
        payment is already on the way, you can ignore this note.
      </Text>

      <Section className="my-6 rounded-xl border border-solid border-[#F59E0B] bg-[#FFFBEB] p-6">
        <Text className="m-0 text-xs uppercase tracking-[0.2em] text-ink-muted">
          {description}
        </Text>
        <Text className="mt-2 text-3xl font-medium tracking-tight text-ink">
          {formatUSD(amountCents)}
        </Text>
        {dueDate ? (
          <Text className="mt-1 text-xs uppercase tracking-[0.16em] text-[#B45309]">
            Was due {formatDate(dueDate)}
          </Text>
        ) : null}
      </Section>

      {payUrl ? <EmailButton href={payUrl}>Pay now</EmailButton> : null}

      <Text className="mt-6 text-sm text-ink-muted">
        Trouble paying or want to adjust terms? Reply to this email and we&apos;ll
        work it out.
      </Text>
    </BaseLayout>
  );
}

export function invoiceOverdueSubject(p: InvoiceOverdueEmailProps) {
  return `Past due · ${formatUSD(p.amountCents)} · ${p.description}`;
}
