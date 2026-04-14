'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ACTIONS, ENTITY_TYPES } from '@/lib/audit-meta';

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
    <form
      onSubmit={onSubmit}
      className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-[repeat(5,minmax(0,1fr))_auto]"
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
  );
}
