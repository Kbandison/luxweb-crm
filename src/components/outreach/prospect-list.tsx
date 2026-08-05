'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { dueState } from '@/lib/outreach/meta';
import type { ProspectRow, SetterOption } from '@/lib/queries/outreach';
import { ProspectCard } from './prospect-card';

type FilterKey = 'all' | 'due' | 'callback' | 'interested' | 'new' | 'no_answer';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'due', label: 'Due' },
  { key: 'callback', label: 'Callbacks' },
  { key: 'interested', label: 'Interested' },
  { key: 'new', label: 'Not yet called' },
  { key: 'no_answer', label: 'No answer' },
];

function matchesFilter(p: ProspectRow, key: FilterKey, now: Date): boolean {
  switch (key) {
    case 'all':
      return true;
    case 'due': {
      const d = dueState(p.nextActionAt, now);
      return d === 'overdue' || d === 'today';
    }
    case 'callback':
      return p.status === 'callback';
    case 'interested':
      return p.status === 'interested' || p.status === 'booked';
    case 'new':
      return p.status === 'new';
    case 'no_answer':
      return p.status === 'no_answer';
  }
}

export function ProspectList({
  prospects,
  mode,
  nowIso,
  homeZone,
  setters,
}: {
  prospects: ProspectRow[];
  /** 'setter' → log calls; 'owner' → read + who owns it. */
  mode: 'setter' | 'owner';
  /** Server-rendered timestamp — keeps due state and local times stable. */
  nowIso: string;
  /** Studio timezone — prospects in it don't get a local-clock chip. */
  homeZone?: string;
  /** Owner only: reassign targets. */
  setters?: SetterOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<'delete' | null>(null);

  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const confirming = prospects.find((p) => p.id === confirmId) ?? null;

  const dueCount = useMemo(
    () => prospects.filter((p) => matchesFilter(p, 'due', now)).length,
    [prospects, now],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return prospects.filter((p) => {
      if (!matchesFilter(p, filter, now)) return false;
      if (!q) return true;
      const haystack = [p.fullName, p.company, p.email, p.industry]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (haystack.includes(q)) return true;
      return qDigits.length >= 3 && (p.phone ?? '').replace(/\D/g, '').includes(qDigits);
    });
  }, [prospects, filter, search, now]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/outreach/prospects/${id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't delete", body.error ?? 'Try again.');
        return;
      }
      toast.success('Prospect removed');
      setConfirmId(null);
      router.refresh();
    } catch {
      toast.error("Couldn't delete", 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  async function bulk(
    action: 'dnc' | 'not_interested' | 'delete' | 'reassign',
    ownerId?: string,
  ) {
    setBusy(true);
    try {
      const res = await fetch('/api/outreach/prospects/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], action, owner_id: ownerId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't update", body.error ?? 'Try again.');
        return;
      }
      toast.success(`${body.affected} updated`);
      setSelected(new Set());
      setBulkConfirm(null);
      router.refresh();
    } catch {
      toast.error("Couldn't update", 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  if (prospects.length === 0) {
    return (
      <EmptyState
        title="No prospects yet"
        description={
          mode === 'setter'
            ? 'Add one with the button above and start dialing.'
            : 'Nothing here yet.'
        }
      />
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-meta transition-colors ${
              filter === f.key
                ? 'bg-copper text-surface'
                : 'bg-surface-2 text-ink-muted hover:text-ink'
            }`}
          >
            {f.label}
            {f.key === 'due' && dueCount > 0 ? ` · ${dueCount}` : ''}
          </button>
        ))}
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter this list…"
          className="h-8 w-auto flex-1 sm:max-w-[220px]"
          aria-label="Filter the call list"
        />
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-copper/40 bg-copper-soft px-4 py-2.5">
          <span className="font-sans text-xs font-medium text-ink">
            {selected.size} selected
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void bulk('dnc')}
          >
            Do not call
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void bulk('not_interested')}
          >
            Not interested
          </Button>
          {mode === 'owner' && setters && setters.length > 0 ? (
            <select
              defaultValue=""
              disabled={busy}
              onChange={(e) => {
                const target = e.target.value;
                e.target.value = '';
                if (target) void bulk('reassign', target);
              }}
              aria-label="Reassign selected prospects"
              className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-ink focus-visible:border-copper focus-visible:outline-none"
            >
              <option value="">Reassign to…</option>
              {setters.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setBulkConfirm('delete')}
          >
            Delete
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto font-mono text-[10px] uppercase tracking-meta text-ink-subtle hover:text-ink"
          >
            Clear
          </button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          description="Try a different filter or clear the search."
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((p) => (
            <ProspectCard
              key={p.id}
              prospect={p}
              mode={mode}
              now={now}
              homeZone={homeZone}
              selected={selected.has(p.id)}
              onToggleSelect={() => toggle(p.id)}
              setters={setters}
              onDelete={() => setConfirmId(p.id)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? `Remove ${confirming.fullName}?` : ''}
        description="This deletes the prospect and its call history."
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        onConfirm={() => {
          if (confirming) void remove(confirming.id);
        }}
        onCancel={() => setConfirmId(null)}
      />

      <ConfirmDialog
        open={bulkConfirm === 'delete'}
        title={`Delete ${selected.size} prospect${selected.size === 1 ? '' : 's'}?`}
        description="This deletes them and their call history."
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        onConfirm={() => void bulk('delete')}
        onCancel={() => setBulkConfirm(null)}
      />
    </>
  );
}
