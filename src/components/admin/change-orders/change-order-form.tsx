'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { ContractBody } from '@/components/contract/contract-body';
import { DEFAULT_EXPIRY_DAYS } from '@/lib/agreements/expiry';
import { formatUSD } from '@/lib/formatters';
import { cn } from '@/lib/utils';

type PriceKind = 'adds' | 'credit' | 'none';

/**
 * Write a change order, see exactly what the client will sign, then sign &
 * send it. Every edit invalidates the preview, so what's signed is always
 * what was last previewed.
 */
export function ChangeOrderForm({
  contractId,
  projectId,
  nextNumber,
  currentTotalCents,
  senderName,
}: {
  contractId: string;
  projectId: string;
  nextNumber: number;
  currentTotalCents: number;
  senderName: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState('');
  const [priceKind, setPriceKind] = useState<PriceKind>('adds');
  const [amount, setAmount] = useState('');
  const [billing, setBilling] = useState<'on_approval' | 'on_signing'>('on_approval');
  const [weeks, setWeeks] = useState('0');
  const [expiryDays, setExpiryDays] = useState(DEFAULT_EXPIRY_DAYS);
  const [preview, setPreview] = useState<{ body: string; newTotal: string } | null>(null);
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signName, setSignName] = useState(senderName ?? '');
  const [agreed, setAgreed] = useState(false);

  const dollars = Number(amount.replace(/[^0-9.]/g, '')) || 0;
  const amountCents =
    priceKind === 'none' ? 0 : Math.round(dollars * 100) * (priceKind === 'credit' ? -1 : 1);

  function draft() {
    return {
      title: title.trim(),
      description: description.trim(),
      scope_lines: scope.split('\n').map((l) => l.trim()).filter(Boolean),
      amount_cents: amountCents,
      timeline_weeks: Math.trunc(Number(weeks) || 0),
      billing,
    };
  }

  // Any change makes the preview stale; sending needs a fresh one.
  function edit<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPreview(null);
      setError(null);
    };
  }

  async function runPreview() {
    setBusy('preview');
    setError(null);
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}/change-orders/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft()),
      });
      const j = (await res.json().catch(() => ({}))) as {
        body_md?: string;
        new_total?: string;
        error?: string;
      };
      if (!res.ok || !j.body_md) {
        setError(j.error ?? "Couldn't preview the change order.");
        return;
      }
      setPreview({ body: j.body_md, newTotal: j.new_total ?? '' });
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy('send');
    setError(null);
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}/change-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: draft(),
          full_name: signName.trim(),
          agreed: true,
          expires_in_days: expiryDays,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !j.id) {
        setError(j.error ?? "Couldn't send the change order.");
        return;
      }
      toast.success(`Change order #${nextNumber} sent`, `The client has ${expiryDays} days to sign.`);
      router.push(`/admin/projects/${projectId}/change-orders/${j.id}`);
    } finally {
      setBusy(null);
    }
  }

  const canPreview =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    (priceKind === 'none' || dollars > 0);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="co-title">Title</Label>
          <Input
            id="co-title"
            value={title}
            maxLength={200}
            onChange={(e) => edit(setTitle)(e.target.value)}
            placeholder="Add online booking"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="co-description">What&apos;s changing</Label>
          <textarea
            id="co-description"
            rows={4}
            value={description}
            onChange={(e) => edit(setDescription)(e.target.value)}
            placeholder="Client asked to add online booking with a deposit at checkout."
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-sans text-sm text-ink focus:border-copper focus:outline-none"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="co-scope">Scope changes (optional, one per line)</Label>
          <textarea
            id="co-scope"
            rows={3}
            value={scope}
            onChange={(e) => edit(setScope)(e.target.value)}
            placeholder={'Booking page\nStripe deposit at booking'}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-sans text-sm text-ink focus:border-copper focus:outline-none"
          />
        </div>
      </section>

      <section className="space-y-4">
        <p className="font-mono text-[10px] font-medium uppercase tracking-meta text-ink-muted">
          Price · currently {formatUSD(currentTotalCents)}
        </p>
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {(
            [
              ['adds', 'Adds cost'],
              ['credit', 'Credit'],
              ['none', 'No price change'],
            ] as const
          ).map(([kind, label], i) => (
            <button
              key={kind}
              type="button"
              aria-pressed={priceKind === kind}
              onClick={() => edit(setPriceKind)(kind)}
              className={cn(
                'px-3 py-1.5 font-mono text-[10px] uppercase tracking-meta transition-colors',
                i > 0 && 'border-l border-border',
                priceKind === kind
                  ? 'bg-copper-soft/60 text-copper'
                  : 'bg-surface text-ink-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {priceKind !== 'none' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="co-amount">{priceKind === 'credit' ? 'Credit (USD)' : 'Amount (USD)'}</Label>
              <Input
                id="co-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => edit(setAmount)(e.target.value)}
                placeholder="1200"
              />
              <p className="font-sans text-xs text-ink-subtle">
                New total: {formatUSD(currentTotalCents + amountCents)}
              </p>
            </div>
            {priceKind === 'adds' ? (
              <div className="space-y-1.5">
                <Label htmlFor="co-billing">Billed</Label>
                <select
                  id="co-billing"
                  value={billing}
                  onChange={(e) => edit(setBilling)(e.target.value as 'on_approval' | 'on_signing')}
                  className="h-10 w-full rounded-md border border-border bg-surface px-3 font-sans text-sm text-ink focus:border-copper focus:outline-none"
                >
                  <option value="on_approval">When the work is approved (standard)</option>
                  <option value="on_signing">When they sign the change order</option>
                </select>
              </div>
            ) : (
              <p className="self-end font-sans text-xs text-ink-muted">
                Comes off the next payments not yet invoiced. Anything left over
                is flagged for you to settle by hand.
              </p>
            )}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="co-weeks">Timeline change (weeks)</Label>
          <Input
            id="co-weeks"
            inputMode="numeric"
            value={weeks}
            onChange={(e) => edit(setWeeks)(e.target.value.replace(/[^0-9-]/g, ''))}
          />
          <p className="font-sans text-xs text-ink-subtle">+ extends, − shortens, 0 for none.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="co-expiry">Open for signature</Label>
          <select
            id="co-expiry"
            value={expiryDays}
            onChange={(e) => setExpiryDays(Number(e.target.value))}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 font-sans text-sm text-ink focus:border-copper focus:outline-none"
          >
            {[7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {d} days{d === DEFAULT_EXPIRY_DAYS ? ' (standard)' : ''}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="button" variant="secondary" onClick={runPreview} disabled={!canPreview || busy !== null}>
          {busy === 'preview' ? 'Rendering…' : preview ? 'Refresh preview' : 'Preview'}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="font-sans text-sm text-danger">
          {error}
        </p>
      ) : null}

      {preview ? (
        <>
          <article className="rounded-2xl border border-border bg-surface p-8 md:p-10">
            <ContractBody body={preview.body} />
          </article>

          <section className="space-y-4 rounded-2xl border border-copper/30 bg-copper-soft/20 p-6">
            <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
              Sign &amp; send change order #{nextNumber}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="co-sign-name">Your full name</Label>
              <Input
                id="co-sign-name"
                value={signName}
                onChange={(e) => setSignName(e.target.value)}
                placeholder={senderName ?? 'As it appears on your profile'}
              />
            </div>
            <label className="flex items-start gap-2 text-ink">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border accent-copper"
              />
              <span className="text-sm">
                I&apos;ve reviewed this change order and sign it on behalf of
                LuxWeb Studio LLC.
              </span>
            </label>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={send}
                disabled={!agreed || signName.trim().length < 2 || busy !== null}
              >
                {busy === 'send' ? 'Sending…' : 'Sign & send'}
              </Button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
