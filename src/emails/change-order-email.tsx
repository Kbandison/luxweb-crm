import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';
import { formatDateLong, formatUSD } from '@/lib/formatters';

export type ChangeOrderEmailProps = {
  /** ready → to the client; signed / declined → to the studio. */
  kind: 'ready' | 'signed' | 'declined';
  recipientName: string;
  clientName: string;
  number: number;
  title: string;
  amountCents: number;
  expiresAt?: string | null;
  reason?: string | null;
  url: string;
};

function priceLine(amountCents: number): string {
  if (amountCents > 0) return `Adds ${formatUSD(amountCents)}`;
  if (amountCents < 0) return `Credit of ${formatUSD(-amountCents)}`;
  return 'No change to the price';
}

/** Change order: ready to sign (client), or signed / declined (studio). */
export default function ChangeOrderEmail(props: ChangeOrderEmailProps) {
  const { kind, recipientName, clientName, number, title, amountCents, expiresAt, reason, url } = props;
  const label = `Change order #${number}`;
  return (
    <BaseLayout
      preview={
        kind === 'ready'
          ? `${label} is ready to sign`
          : kind === 'signed'
            ? `${clientName} signed ${label}`
            : `${clientName} declined ${label}`
      }
    >
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        {kind === 'ready' ? 'Change order' : kind === 'signed' ? 'Change order signed' : 'Change order declined'}
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {recipientName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        {kind === 'ready' ? (
          <>
            We&apos;ve put the change we discussed in writing. It&apos;s signed
            on our side and waiting on yours.
          </>
        ) : kind === 'signed' ? (
          <>
            <strong>{clientName}</strong> signed it. The signed copy is on its
            way to both of you.
          </>
        ) : (
          <>
            <strong>{clientName}</strong> declined it.
          </>
        )}
      </Text>
      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 text-xs uppercase tracking-[0.2em] text-ink-muted">{label}</Text>
        <Text className="mb-0 mt-2 text-lg font-medium tracking-tight text-ink">{title}</Text>
        <Text className="mb-0 mt-1 text-sm text-ink-muted">{priceLine(amountCents)}</Text>
        {kind === 'ready' && expiresAt ? (
          <Text className="mb-0 mt-2 text-sm text-ink">
            Open until <strong>{formatDateLong(expiresAt)}</strong>.
          </Text>
        ) : null}
        {kind !== 'ready' && reason ? (
          <Text className="mb-0 mt-3 whitespace-pre-wrap text-sm text-ink">{reason}</Text>
        ) : null}
      </Section>
      <EmailButton href={url}>{kind === 'ready' ? 'Review & sign' : 'Open change order'}</EmailButton>
    </BaseLayout>
  );
}

export function changeOrderSubject(p: Pick<ChangeOrderEmailProps, 'kind' | 'number' | 'title' | 'clientName'>) {
  const label = `Change order #${p.number}`;
  if (p.kind === 'ready') return `${label} ready to sign: ${p.title}`;
  return p.kind === 'signed'
    ? `${label} signed — ${p.clientName}`
    : `${label} declined — ${p.clientName}`;
}
