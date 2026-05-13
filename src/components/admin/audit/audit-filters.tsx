'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ACTIONS, ENTITY_TYPES } from '@/lib/audit-meta';
import { cn } from '@/lib/utils';

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

type Preset = {
  key: string;
  label: string;
  params: () => Record<string, string>;
};

const PRESETS: readonly Preset[] = [
  {
    key: 'today',
    label: 'Today',
    params: () => ({ from: new Date().toISOString().slice(0, 10) }),
  },
  {
    key: 'week',
    label: 'Last 7 days',
    params: () => ({ from: isoDateDaysAgo(7) }),
  },
  {
    key: 'month',
    label: 'Last 30 days',
    params: () => ({ from: isoDateDaysAgo(30) }),
  },
  {
    key: 'deletes',
    label: 'Deletions',
    params: () => ({ action: 'delete' }),
  },
  {
    key: 'sends',
    label: 'Outbound (sent/accept)',
    params: () => ({ action: 'send' }),
  },
];

export function AuditFilters() {
  const router = useRouter();
  const sp = useSearchParams();

  const current = {
    entity_type: sp.get('entity_type') ?? '',
    action: sp.get('action') ?? '',
    actor_email: sp.get('actor_email') ?? '',
    from: sp.get('from') ?? '',
    to: sp.get('to') ?? '',
  };

  function applyPreset(p: Preset) {
    const next = new URLSearchParams(p.params());
    router.push(next.toString() ? `/admin/audit?${next.toString()}` : '/admin/audit');
  }

  // A preset is "active" when its target params exactly match current state.
  function isPresetActive(p: Preset): boolean {
    const target = p.params();
    return Object.entries(target).every(
      ([k, v]) => (sp.get(k) ?? '') === v,
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next = new URLSearchParams();
    const entity = String(form.get('entity_type') ?? '');
    const action = String(form.get('action') ?? '');
    const actorEmail = String(form.get('actor_email') ?? '').trim();
    const from = String(form.get('from') ?? '');
    const to = String(form.get('to') ?? '');
    if (entity) next.set('entity_type', entity);
    if (action) next.set('action', action);
    if (actorEmail) next.set('actor_email', actorEmail);
    if (from) next.set('from', from);
    if (to) next.set('to', to);
    router.push(next.toString() ? `/admin/audit?${next.toString()}` : '/admin/audit');
  }

  function clear() {
    router.push('/admin/audit');
  }

  const hasFilters = Object.values(current).some((v) => v !== '');

  return (
    <div className="space-y-3">
      {/* Quick preset chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
          Quick filter:
        </span>
        {PRESETS.map((p) => {
          const active = isPresetActive(p);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p)}
              className={cn(
                'rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-meta transition-colors',
                active
                  ? 'border-copper bg-copper-soft/60 text-copper'
                  : 'border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink',
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

    <form
      onSubmit={onSubmit}
      className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]"
    >
      <div className="space-y-1.5">
        <Label htmlFor="entity_type">Entity</Label>
        <select
          id="entity_type"
          name="entity_type"
          defaultValue={current.entity_type}
          className="flex h-10 w-full rounded-md border border-border bg-surface px-3 font-sans text-sm text-ink focus:border-copper focus:outline-none focus:ring-2 focus:ring-copper/30"
        >
          <option value="">All entities</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="action">Action</Label>
        <select
          id="action"
          name="action"
          defaultValue={current.action}
          className="flex h-10 w-full rounded-md border border-border bg-surface px-3 font-sans text-sm text-ink focus:border-copper focus:outline-none focus:ring-2 focus:ring-copper/30"
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="actor_email">Actor email</Label>
        <Input
          id="actor_email"
          name="actor_email"
          defaultValue={current.actor_email}
          placeholder="contains…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="from">From</Label>
        <Input id="from" name="from" type="date" defaultValue={current.from} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="to">To</Label>
        <Input id="to" name="to" type="date" defaultValue={current.to} />
      </div>

      <div className="flex items-end gap-2">
        <Button type="submit" size="sm">
          Apply
        </Button>
        {hasFilters ? (
          <Button type="button" variant="secondary" size="sm" onClick={clear}>
            Clear
          </Button>
        ) : null}
      </div>
    </form>
    </div>
  );
}
