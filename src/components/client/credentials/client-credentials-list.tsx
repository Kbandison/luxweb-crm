'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CREDENTIAL_KINDS,
  CREDENTIAL_KIND_LABEL,
  type CredentialKind,
} from '@/lib/types/credential';
import { cn } from '@/lib/utils';

export type ClientCredentialItem = {
  id: string;
  kind: CredentialKind;
  label: string;
  username: string | null;
  url: string | null;
  notes: string | null;
};

type FormState = {
  kind: CredentialKind;
  label: string;
  username: string;
  url: string;
  secret: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  kind: 'password',
  label: '',
  username: '',
  url: '',
  secret: '',
  notes: '',
};

export function ClientCredentialsList({
  projectId,
  items,
}: {
  projectId: string;
  items: ClientCredentialItem[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-sans text-sm text-ink-muted">
          {items.length === 0
            ? 'No credentials shared yet.'
            : `${items.length} credential${items.length === 1 ? '' : 's'}. Encrypted at rest.`}
        </p>
        <Button size="sm" onClick={() => setAdding(true)}>
          Add credential
        </Button>
      </div>

      {items.length > 0 ? (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {items.map((c, i) => (
            <li
              key={c.id}
              className={cn('px-5 py-4', i > 0 && 'border-t border-border')}
            >
              <Row item={c} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
          <p className="font-display text-lg font-medium text-ink">
            No credentials shared yet
          </p>
          <p className="mx-auto mt-2 max-w-md font-sans text-sm text-ink-muted">
            When LuxWeb shares logins with you, they appear here. You can also
            add your own — for example, your hosting or domain registrar
            login if you already have one.
          </p>
        </div>
      )}

      {adding ? (
        <AddCredentialDialog
          onCancel={() => setAdding(false)}
          onSubmit={async (form) => {
            const res = await fetch('/api/client/credentials', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...form, project_id: projectId }),
            });
            if (!res.ok) {
              const j = (await res.json().catch(() => ({}))) as {
                error?: string;
              };
              throw new Error(j.error ?? 'Failed to save');
            }
            setAdding(false);
            startTransition(() => router.refresh());
          }}
        />
      ) : null}
    </section>
  );
}

function Row({ item }: { item: ClientCredentialItem }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleReveal() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/client/credentials/${item.id}/reveal`, {
        method: 'POST',
      });
      const j = (await res.json()) as { secret?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed to reveal');
      setRevealed(j.secret ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reveal');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-sans text-sm font-medium text-ink">
              {item.label}
            </p>
            <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-muted">
              {CREDENTIAL_KIND_LABEL[item.kind]}
            </span>
          </div>
          {item.username || item.url ? (
            <p className="mt-1 truncate font-mono text-xs text-ink-muted">
              {item.username}
              {item.username && item.url ? ' · ' : ''}
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-copper hover:underline"
                >
                  {item.url}
                </a>
              ) : null}
            </p>
          ) : null}
          {item.notes ? (
            <p className="mt-1 whitespace-pre-wrap font-sans text-xs text-ink-subtle">
              {item.notes}
            </p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReveal}
          disabled={busy}
        >
          {busy ? 'Revealing…' : revealed ? 'Refresh' : 'Reveal'}
        </Button>
      </div>

      {revealed !== null ? (
        <div className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-3 py-2">
          <code className="flex-1 break-all font-mono text-xs text-ink">
            {revealed}
          </code>
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRevealed(null)}>
            Hide
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AddCredentialDialog({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (form: FormState) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
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
        className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-xl"
      >
        <div className="space-y-1">
          <h2 className="font-display text-lg font-medium text-ink">
            Add credential
          </h2>
          <p className="font-sans text-xs text-ink-muted">
            Stored encrypted at rest. LuxWeb&apos;s admin team and you can
            reveal it; reveals are logged.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cl_cred_kind">Type</Label>
            <select
              id="cl_cred_kind"
              value={form.kind}
              onChange={(e) =>
                setForm((f) => ({ ...f, kind: e.target.value as CredentialKind }))
              }
              className="h-9 w-full rounded-md border border-border bg-bg px-3 font-sans text-sm text-ink"
            >
              {CREDENTIAL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CREDENTIAL_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl_cred_label">Label</Label>
            <Input
              id="cl_cred_label"
              required
              maxLength={200}
              placeholder="Hostinger admin"
              value={form.label}
              onChange={(e) =>
                setForm((f) => ({ ...f, label: e.target.value }))
              }
            />
          </div>
        </div>

        {form.kind !== 'note' ? (
          <div className="space-y-1.5">
            <Label htmlFor="cl_cred_username">Username / account</Label>
            <Input
              id="cl_cred_username"
              maxLength={500}
              value={form.username}
              onChange={(e) =>
                setForm((f) => ({ ...f, username: e.target.value }))
              }
            />
          </div>
        ) : null}

        {form.kind !== 'note' ? (
          <div className="space-y-1.5">
            <Label htmlFor="cl_cred_url">URL</Label>
            <Input
              id="cl_cred_url"
              type="url"
              maxLength={2000}
              placeholder="https://"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="cl_cred_secret">
            {form.kind === 'note' ? 'Note contents' : 'Secret'}
          </Label>
          <textarea
            id="cl_cred_secret"
            rows={form.kind === 'note' ? 5 : 2}
            maxLength={20000}
            required
            value={form.secret}
            onChange={(e) =>
              setForm((f) => ({ ...f, secret: e.target.value }))
            }
            className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-ink"
          />
        </div>

        {form.kind !== 'note' ? (
          <div className="space-y-1.5">
            <Label htmlFor="cl_cred_notes">Notes</Label>
            <textarea
              id="cl_cred_notes"
              rows={2}
              maxLength={5000}
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              className="w-full rounded-md border border-border bg-bg px-3 py-2 font-sans text-sm text-ink"
            />
          </div>
        ) : null}

        {error ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  );
}
