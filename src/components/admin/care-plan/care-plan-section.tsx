'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatUSD, formatDateLong } from '@/lib/formatters';
import {
  CARE_PLAN_STATUS_LABEL,
  CARE_PLAN_STATUS_TONE,
  type CarePlanStatus,
} from '@/lib/care-plan/types';
import { cn } from '@/lib/utils';

export type AdminCarePlanSectionProps = {
  projectId: string;
  plan: {
    id: string;
    amountCents: number;
    interval: string;
    status: CarePlanStatus;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    paymentMethodBrand: string | null;
    paymentMethodLast4: string | null;
  } | null;
};

export function AdminCarePlanSection({
  projectId,
  plan,
}: AdminCarePlanSectionProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'cancel' | 'resume' | null>(
    null,
  );
  const [enrolling, setEnrolling] = useState(false);

  async function enroll(trialDays: number | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/care-plan/enroll`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            trialDays ? { trial_period_days: trialDays } : {},
          ),
        },
      );
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Failed to enroll');
        return;
      }
      setEnrolling(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function action(actionName: 'cancel' | 'resume') {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/care-plan/${plan.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionName }),
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

  if (!plan) {
    return (
      <section className="space-y-3 rounded-2xl border border-dashed border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-copper">
              Care Plan
            </p>
            <p className="mt-1 font-sans text-sm text-ink-muted">
              No active subscription. Enroll the client to start a recurring
              charge — they&apos;ll activate it from their portal.
            </p>
          </div>
          <Button onClick={() => setEnrolling(true)} disabled={busy}>
            Enroll project
          </Button>
        </div>
        {error ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
            {error}
          </p>
        ) : null}
        {enrolling ? (
          <EnrollDialog
            busy={busy}
            onCancel={() => setEnrolling(false)}
            onSubmit={enroll}
          />
        ) : null}
      </section>
    );
  }

  const isActiveLike =
    plan.status === 'active' || plan.status === 'trialing';
  const willCancel = plan.cancelAtPeriodEnd && isActiveLike;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-copper">
            Care Plan
          </p>
          <h2 className="mt-1 font-display text-xl font-medium text-ink">
            {formatUSD(plan.amountCents)}
            <span className="ml-1 font-sans text-sm font-normal text-ink-muted">
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

      {plan.status === 'incomplete' ? (
        <p className="rounded-md bg-warning/10 px-3 py-2 font-sans text-xs text-warning">
          Waiting on the client to add a payment method from their portal to
          activate the plan.
        </p>
      ) : null}

      {willCancel ? (
        <p className="rounded-md bg-warning/10 px-3 py-2 font-sans text-xs text-warning">
          Set to cancel at period end.
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
        {isActiveLike && !willCancel ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming('cancel')}
            disabled={busy}
          >
            Cancel at period end
          </Button>
        ) : null}
        {willCancel ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming('resume')}
            disabled={busy}
          >
            Resume
          </Button>
        ) : null}
        <Link
          href="/admin/care-plans"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-copper"
        >
          All care plans →
        </Link>
      </div>

      <ConfirmDialog
        open={confirming === 'cancel'}
        title="Cancel Care Plan at period end?"
        description="The subscription stops renewing after the current billing period. Resume any time before then."
        confirmLabel="Cancel at period end"
        tone="danger"
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => action('cancel')}
      />
      <ConfirmDialog
        open={confirming === 'resume'}
        title="Resume Care Plan?"
        description="The subscription will continue renewing on the next period."
        confirmLabel="Resume"
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => action('resume')}
      />
    </section>
  );
}

function EnrollDialog({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (trialDays: number | null) => void;
}) {
  const [trial, setTrial] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = trial.trim() === '' ? null : Math.floor(Number(trial));
    if (n != null && (Number.isNaN(n) || n < 1 || n > 365)) return;
    onSubmit(n);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 p-4"
      onClick={!busy ? onCancel : undefined}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-xl"
      >
        <div className="space-y-1">
          <h2 className="font-display text-lg font-medium text-ink">
            Enroll in Care Plan?
          </h2>
          <p className="font-sans text-xs text-ink-muted">
            A subscription is created in Stripe. The first invoice stays
            unpaid until the client adds a card from their portal.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cp_trial_days">Trial days (optional)</Label>
          <Input
            id="cp_trial_days"
            type="number"
            min={1}
            max={365}
            placeholder="e.g. 14"
            value={trial}
            onChange={(e) => setTrial(e.target.value)}
          />
          <p className="font-sans text-xs text-ink-subtle">
            No charge until the trial ends. Leave blank to bill immediately.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Enrolling…' : 'Enroll'}
          </Button>
        </div>
      </form>
    </div>
  );
}
