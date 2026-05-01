'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  loadStripe,
  type Stripe as StripeJs,
  type StripeElementStyle,
} from '@stripe/stripe-js';
import {
  CardCvcElement,
  CardExpiryElement,
  CardNumberElement,
  Elements,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatUSD, formatDateLong } from '@/lib/formatters';
import {
  CARE_PLAN_STATUS_LABEL,
  CARE_PLAN_STATUS_TONE,
  type CarePlanStatus,
} from '@/lib/care-plan/types';
import { cn } from '@/lib/utils';

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
  invalid: { color: '#b91c1c', iconColor: '#b91c1c' },
};

export type CarePlanCardProps = {
  plan: {
    id: string;
    amountCents: number;
    interval: string;
    status: CarePlanStatus;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    paymentMethodBrand: string | null;
    paymentMethodLast4: string | null;
    pendingClientSecret: string | null;
  };
  publishableKey: string;
};

export function CarePlanCard({ plan, publishableKey }: CarePlanCardProps) {
  const router = useRouter();
  const [activating, setActivating] = useState(false);
  const [updatingPm, setUpdatingPm] = useState(false);
  const [confirming, setConfirming] = useState<'cancel' | 'resume' | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPending = plan.status === 'incomplete' && !!plan.pendingClientSecret;
  const isActiveLike =
    plan.status === 'active' || plan.status === 'trialing';
  const willCancel = plan.cancelAtPeriodEnd && isActiveLike;

  async function postAction(action: 'cancel' | 'resume') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/client/care-plan/${plan.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Action failed');
        return;
      }
      setConfirming(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-copper">
            Care Plan
          </p>
          <h2 className="mt-1 font-display text-2xl font-medium text-ink">
            {formatUSD(plan.amountCents)}
            <span className="ml-1 font-sans text-base font-normal text-ink-muted">
              / {plan.interval}
            </span>
          </h2>
        </div>
        <span
          className={cn(
            'inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em]',
            CARE_PLAN_STATUS_TONE[plan.status],
          )}
        >
          {CARE_PLAN_STATUS_LABEL[plan.status]}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-y-2 font-sans text-sm">
        {isActiveLike && plan.currentPeriodEnd ? (
          <>
            <dt className="text-ink-muted">
              {willCancel ? 'Cancels on' : 'Next renewal'}
            </dt>
            <dd className="text-right text-ink">
              {formatDateLong(plan.currentPeriodEnd)}
            </dd>
          </>
        ) : null}
        {plan.paymentMethodBrand && plan.paymentMethodLast4 ? (
          <>
            <dt className="text-ink-muted">Payment method</dt>
            <dd className="text-right text-ink">
              {plan.paymentMethodBrand.toUpperCase()} ····{' '}
              {plan.paymentMethodLast4}
            </dd>
          </>
        ) : null}
      </dl>

      {willCancel ? (
        <p className="rounded-md bg-warning/10 px-3 py-2 font-sans text-xs text-warning">
          Your plan is set to cancel at the end of the current period. You can
          resume any time before then.
        </p>
      ) : null}

      {plan.status === 'past_due' ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 font-sans text-xs text-danger">
          The most recent payment failed. Update your payment method to
          continue your Care Plan.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 font-sans text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {isPending ? (
          <Button onClick={() => setActivating(true)} disabled={busy}>
            Activate Care Plan
          </Button>
        ) : null}

        {isActiveLike && !willCancel ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setUpdatingPm(true)}
              disabled={busy}
            >
              Update payment method
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming('cancel')}
              disabled={busy}
            >
              Cancel plan
            </Button>
          </>
        ) : null}

        {willCancel ? (
          <Button onClick={() => setConfirming('resume')} disabled={busy}>
            Resume plan
          </Button>
        ) : null}

        {plan.status === 'past_due' ? (
          <Button onClick={() => setUpdatingPm(true)} disabled={busy}>
            Update payment method
          </Button>
        ) : null}
      </div>

      {activating && plan.pendingClientSecret ? (
        <Elements
          stripe={loadStripeMemo(publishableKey)}
          options={{ clientSecret: plan.pendingClientSecret }}
        >
          <ActivationForm
            planRowId={plan.id}
            amountCents={plan.amountCents}
            clientSecret={plan.pendingClientSecret}
            onClose={() => setActivating(false)}
          />
        </Elements>
      ) : null}

      {updatingPm ? (
        <Elements stripe={loadStripeMemo(publishableKey)}>
          <UpdatePaymentMethodForm
            planRowId={plan.id}
            onClose={() => setUpdatingPm(false)}
          />
        </Elements>
      ) : null}

      <ConfirmDialog
        open={confirming === 'cancel'}
        title="Cancel Care Plan?"
        description="Your plan will remain active through the current billing period, then stop renewing. You can resume any time before it ends."
        confirmLabel="Cancel plan"
        tone="danger"
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => postAction('cancel')}
      />
      <ConfirmDialog
        open={confirming === 'resume'}
        title="Resume Care Plan?"
        description="Your plan will continue renewing on the next period."
        confirmLabel="Resume"
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => postAction('resume')}
      />
    </section>
  );
}

const stripePromiseCache = new Map<string, Promise<StripeJs | null>>();

function loadStripeMemo(publishableKey: string) {
  let p = stripePromiseCache.get(publishableKey);
  if (!p) {
    p = loadStripe(publishableKey);
    stripePromiseCache.set(publishableKey, p);
  }
  return p;
}

function ActivationForm({
  planRowId,
  amountCents,
  clientSecret,
  onClose,
}: {
  planRowId: string;
  amountCents: number;
  clientSecret: string;
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    const cardNumber = elements.getElement(CardNumberElement);
    if (!cardNumber) {
      setError('Card field not ready. Refresh and try again.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: stripeError, paymentIntent } =
      await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardNumber,
          billing_details: name ? { name } : undefined,
        },
      });

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed');
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      // Pull fresh state into our DB without waiting on the webhook.
      await fetch(`/api/client/care-plan/${planRowId}/refresh`, {
        method: 'POST',
      });
      router.refresh();
      return;
    }

    setSubmitting(false);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 space-y-5 rounded-xl border border-copper/30 bg-copper-soft/30 p-5"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-medium text-ink">
          Activate Care Plan
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-copper"
        >
          ← Cancel
        </button>
      </div>

      <p className="font-sans text-sm text-ink-muted">
        You&apos;ll be charged {formatUSD(amountCents)} now and on the same
        date each month thereafter. Cancel any time.
      </p>

      <Field label="Name on card">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="cc-name"
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

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 font-sans text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="inline-flex items-center gap-2 rounded-md bg-copper px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-copper-foreground transition-colors hover:bg-copper/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Activating…' : `Pay ${formatUSD(amountCents)}`}
        </button>
      </div>

      <p className="text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
        Secured by Stripe
      </p>
    </form>
  );
}

function UpdatePaymentMethodForm({
  planRowId,
  onClose,
}: {
  planRowId: string;
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(
    null,
  );
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Mint the SetupIntent client_secret on first render.
  useMemo(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/client/care-plan/${planRowId}/setup-intent`,
          { method: 'POST' },
        );
        const j = (await res.json()) as {
          client_secret?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(j.error ?? 'Failed to start');
        if (!cancelled) setSetupClientSecret(j.client_secret ?? null);
      } catch (e) {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : 'Failed to start');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planRowId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !setupClientSecret) return;
    const cardNumber = elements.getElement(CardNumberElement);
    if (!cardNumber) {
      setError('Card field not ready.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: stripeError, setupIntent } =
      await stripe.confirmCardSetup(setupClientSecret, {
        payment_method: {
          card: cardNumber,
          billing_details: name ? { name } : undefined,
        },
      });

    if (stripeError) {
      setError(stripeError.message ?? 'Card setup failed');
      setSubmitting(false);
      return;
    }

    const pmId =
      typeof setupIntent?.payment_method === 'string'
        ? setupIntent.payment_method
        : (setupIntent?.payment_method?.id ?? null);
    if (!pmId) {
      setError('Stripe did not return a payment method.');
      setSubmitting(false);
      return;
    }

    const res = await fetch(
      `/api/client/care-plan/${planRowId}/apply-payment-method`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method_id: pmId }),
      },
    );
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(j.error ?? 'Failed to update');
      setSubmitting(false);
      return;
    }

    router.refresh();
    onClose();
  }

  if (loadError) {
    return (
      <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-5">
        <p className="font-sans text-sm text-danger">{loadError}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted hover:text-copper"
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 space-y-5 rounded-xl border border-border bg-surface-2/60 p-5"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-medium text-ink">
          Update payment method
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-copper"
        >
          ← Cancel
        </button>
      </div>

      <Field label="Name on card">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="cc-name"
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

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 font-sans text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={!stripe || submitting || !setupClientSecret}>
          {submitting ? 'Saving…' : 'Save card'}
        </Button>
      </div>
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
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function StripeFieldWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2.5 transition-colors focus-within:border-copper focus-within:ring-1 focus-within:ring-copper">
      {children}
    </div>
  );
}
