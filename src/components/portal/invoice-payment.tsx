'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';

export function InvoicePayment({
  clientSecret,
  publishableKey,
  returnUrl,
  cancelHref,
}: {
  clientSecret: string;
  publishableKey: string;
  returnUrl: string;
  cancelHref: string;
}) {
  // Each mount gets its own loader — keeps the key scoped and lets us
  // swap between test/live without a full reload in dev.
  const stripePromise = useMemo<Promise<StripeJs | null>>(
    () => loadStripe(publishableKey),
    [publishableKey],
  );

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'flat',
          variables: {
            colorPrimary: '#b45309',
            colorBackground: '#ffffff',
            colorText: '#1a1a1a',
            colorTextSecondary: '#64748b',
            colorTextPlaceholder: '#94a3b8',
            colorDanger: '#b91c1c',
            fontFamily:
              'Inter Tight, ui-sans-serif, system-ui, -apple-system, sans-serif',
            fontSizeBase: '14px',
            spacingUnit: '4px',
            borderRadius: '8px',
          },
          rules: {
            '.Input': {
              border: '1px solid #e5e5e5',
              boxShadow: 'none',
              padding: '10px 12px',
            },
            '.Input:focus': {
              borderColor: '#b45309',
              boxShadow: '0 0 0 1px #b45309',
            },
            '.Label': {
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '10px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#64748b',
              fontWeight: '500',
            },
            '.Tab': {
              border: '1px solid #e5e5e5',
              boxShadow: 'none',
            },
            '.Tab--selected': {
              borderColor: '#b45309',
              backgroundColor: '#fef3c7',
            },
          },
        },
      }}
    >
      <PaymentForm returnUrl={returnUrl} cancelHref={cancelHref} />
    </Elements>
  );
}

function PaymentForm({
  returnUrl,
  cancelHref,
}: {
  returnUrl: string;
  cancelHref: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const absoluteReturnUrl =
      typeof window !== 'undefined'
        ? new URL(returnUrl, window.location.origin).toString()
        : returnUrl;

    // `redirect: 'if_required'` keeps sync card flows inline — only 3DS /
    // wallet methods bounce to Stripe and back. Success for inline flows
    // arrives as a resolved Promise with paymentIntent.status === 'succeeded'.
    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: absoluteReturnUrl },
      redirect: 'if_required',
    });

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed');
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      // Webhook flips the CRM row to paid — we just navigate.
      router.push(cancelHref + `?paid=1`);
      router.refresh();
      return;
    }

    // Other statuses (processing, requires_action without redirect) — stay
    // here and let Stripe finish. Rare with cards.
    setSubmitting(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 font-sans text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Link
          href={cancelHref}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted hover:text-copper"
        >
          ← Cancel
        </Link>
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="inline-flex items-center gap-2 rounded-md bg-copper px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-copper-foreground transition-colors hover:bg-copper/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Processing…' : 'Pay invoice'}
        </button>
      </div>
    </form>
  );
}
