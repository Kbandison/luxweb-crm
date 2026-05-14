'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  loadStripe,
  type Stripe as StripeJs,
  type StripeElementStyle,
} from '@stripe/stripe-js';
import { cn } from '@/lib/utils';
import {
  CardCvcElement,
  CardExpiryElement,
  CardNumberElement,
  Elements,
  ExpressCheckoutElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { SuccessModal } from '@/components/ui/success-modal';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/** Which step of the milestone chain this invoice is paying for —
 * controls the post-payment SuccessModal copy:
 *  - kickoff    → first milestone (deposit) → "we'll get started"
 *  - midway     → middle milestone        → "moving on to the next phase"
 *  - launch     → final milestone         → "your project is complete"
 *  - standalone → unattached / sole       → generic "thanks"
 */
export type MilestoneStage = 'kickoff' | 'midway' | 'launch' | 'standalone';

export function InvoicePayment({
  clientSecret,
  publishableKey,
  returnUrl,
  cancelHref,
  milestoneStage = 'standalone',
}: {
  clientSecret: string;
  publishableKey: string;
  returnUrl: string;
  cancelHref: string;
  milestoneStage?: MilestoneStage;
}) {
  const stripePromise = useMemo<Promise<StripeJs | null>>(
    () => loadStripe(publishableKey),
    [publishableKey],
  );

  return (
    <Elements
      stripe={stripePromise}
      options={{
        // clientSecret on Elements enables post-payment retrieval + Link
        // fingerprinting while keeping us on individual card elements.
        clientSecret,
      }}
    >
      <PaymentForm
        clientSecret={clientSecret}
        returnUrl={returnUrl}
        cancelHref={cancelHref}
        milestoneStage={milestoneStage}
      />
    </Elements>
  );
}

// Styling applied inside Stripe's iframes. Only properties in Stripe's
// whitelist work here (see Stripe Elements Appearance docs) — our page
// chrome (borders, labels, spacing) lives outside the iframe.
const elementStyle: StripeElementStyle = {
  base: {
    fontFamily:
      'Inter Tight, ui-sans-serif, system-ui, -apple-system, sans-serif',
    fontSize: '14px',
    fontSmoothing: 'antialiased',
    color: '#1a1a1a',
    '::placeholder': { color: '#94a3b8' },
    iconColor: '#64748b',
  },
  invalid: {
    color: '#b91c1c',
    iconColor: '#b91c1c',
  },
};

function PaymentForm({
  clientSecret,
  returnUrl,
  cancelHref,
  milestoneStage,
}: {
  clientSecret: string;
  returnUrl: string;
  cancelHref: string;
  milestoneStage: MilestoneStage;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletReady, setWalletReady] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  // Stripe returns a relative return URL as-is to the wallet sheet; wallets
  // need an absolute URL so they can redirect back after 3DS or bank hand-off.
  const absoluteReturnUrl = useMemo(() => {
    if (typeof window === 'undefined') return returnUrl;
    return new URL(returnUrl, window.location.origin).toString();
  }, [returnUrl]);

  async function onExpressConfirm() {
    if (!stripe || !elements) return;
    setError(null);
    setSubmitting(true);

    // Validates the active express checkout payment method (Apple/Google/Link).
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? 'Wallet validation failed');
      setSubmitting(false);
      return;
    }

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: { return_url: absoluteReturnUrl },
      redirect: 'if_required',
    });

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed');
      setSubmitting(false);
      return;
    }

    setSucceeded(true);
  }

  async function onCardSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    const cardNumber = elements.getElement(CardNumberElement);
    if (!cardNumber) {
      setError('Card field not ready. Refresh and try again.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
      clientSecret,
      {
        payment_method: {
          card: cardNumber,
          billing_details: name ? { name } : undefined,
        },
        return_url: absoluteReturnUrl,
      },
    );

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed');
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      setSucceeded(true);
      return;
    }

    // 3DS redirected and came back, or processing — usually handled by Stripe.
    setSubmitting(false);
  }

  return (
    <form onSubmit={onCardSubmit} className="space-y-5">
      {/* Wallet row — Apple Pay / Google Pay / Link / etc.
          Stripe only renders buttons the current browser + customer + merchant
          combination actually supports. On localhost, Google Pay works in
          Chrome; Apple Pay needs Safari + a verified domain in the Stripe
          dashboard (Settings → Payment methods → Apple Pay → Add domain). */}
      <Card
        padding="sm"
        className={cn(
          'transition-opacity',
          walletReady ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={!walletReady}
      >
        <ExpressCheckoutElement
          onConfirm={onExpressConfirm}
          onReady={(event) => {
            // onReady returns an empty availablePaymentMethods if no wallet
            // is eligible; hide the whole row in that case so users don't
            // see an empty box.
            const methods = event.availablePaymentMethods;
            const any = methods
              ? Object.values(methods).some(Boolean)
              : false;
            setWalletReady(any);
          }}
          options={{
            buttonType: { applePay: 'plain', googlePay: 'plain' },
          }}
        />
      </Card>

      {walletReady ? (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
            or pay with card
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
      ) : null}

      <Card padding="lg">
        <div className="space-y-5">
          <Field label="Name on card">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="cc-name"
              placeholder="Kai Noir"
              className="w-full rounded-md border border-border bg-surface px-3 py-2.5 font-sans text-sm text-ink placeholder:text-ink-subtle focus:border-copper focus:outline-none focus:ring-1 focus:ring-copper"
            />
          </Field>

          <Field label="Card number">
            <StripeFieldWrapper>
              <CardNumberElement
                options={{
                  style: elementStyle,
                  placeholder: '1234 1234 1234 1234',
                  showIcon: true,
                }}
              />
            </StripeFieldWrapper>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Expiry">
              <StripeFieldWrapper>
                <CardExpiryElement options={{ style: elementStyle }} />
              </StripeFieldWrapper>
            </Field>
            <Field label="CVC">
              <StripeFieldWrapper>
                <CardCvcElement options={{ style: elementStyle }} />
              </StripeFieldWrapper>
            </Field>
          </div>
        </div>
      </Card>

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
          className="font-mono text-[10px] uppercase tracking-meta text-ink-muted hover:text-copper"
        >
          ← Cancel
        </Link>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={!stripe || submitting}
        >
          {submitting ? 'Processing…' : 'Pay invoice'}
        </Button>
      </div>

      <p className="text-center font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
        Secured by Stripe
      </p>

      <SuccessModal
        open={succeeded}
        title={
          milestoneStage === 'launch' ? 'Project complete' : 'Payment received'
        }
        description={
          milestoneStage === 'kickoff' ? (
            <>
              Thanks — your deposit is in. We&apos;re kicking the project off
              from our side and will be in touch with next steps shortly.
            </>
          ) : milestoneStage === 'midway' ? (
            <>
              Thanks — your payment is in. We&apos;re moving on to the next
              phase. You&apos;ll get a receipt by email shortly.
            </>
          ) : milestoneStage === 'launch' ? (
            <>
              Thanks — your final payment is in. Your project is now complete.
              We&apos;ll be in touch with launch details and the project
              hand-off. A receipt will arrive by email shortly.
            </>
          ) : (
            <>
              Thanks — your payment is in. You&apos;ll get a receipt by email
              shortly.
            </>
          )
        }
        primaryLabel="Back to invoices"
        onPrimary={() => {
          setSucceeded(false);
          toast.success('Payment successful');
          router.push(returnUrl);
          router.refresh();
        }}
        onClose={() => {
          setSucceeded(false);
          router.push(returnUrl);
          router.refresh();
        }}
      />
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="font-mono text-[10px] font-medium uppercase tracking-meta text-ink-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

// Mirrors the non-Stripe <input> styling so card fields feel native.
function StripeFieldWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2.5 transition-colors focus-within:border-copper focus-within:ring-1 focus-within:ring-copper">
      {children}
    </div>
  );
}
