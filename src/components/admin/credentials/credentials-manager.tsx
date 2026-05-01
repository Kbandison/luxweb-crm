'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  CREDENTIAL_KINDS,
  CREDENTIAL_KIND_LABEL,
  type CredentialKind,
} from '@/lib/types/credential';
import { cn } from '@/lib/utils';

export type CredentialItem = {
  id: string;
  kind: CredentialKind;
  label: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  visibleToClient: boolean;
  createdAt: string;
};

type FormState = {
  kind: CredentialKind;
  label: string;
  username: string;
  url: string;
  secret: string;
  notes: string;
  visible_to_client: boolean;
};

const EMPTY_FORM: FormState = {
  kind: 'password',
  label: '',
  username: '',
  url: '',
  secret: '',
  notes: '',
  visible_to_client: false,
};

export function CredentialsManager({
  projectId,
  initial,
}: {
  projectId: string;
  initial: CredentialItem[];
}) {
  const router = useRouter();
  const [items] = useState<CredentialItem[]>(initial);
  const [editing, setEditing] = useState<CredentialItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] =
    useState<CredentialItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-sans text-sm text-ink-muted">
          {items.length === 0
            ? 'No credentials saved for this project.'
            : `${items.length} credential${items.length === 1 ? '' : 's'} stored. Encrypted at rest with AES-256-GCM.`}
        </p>
        <Button size="sm" onClick={() => setAdding(true)}>
          New credential
        </Button>
      </div>

      {items.length > 0 ? (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {items.map((c, i) => (
            <li
              key={c.id}
              className={cn(
                'px-5 py-4',
                i > 0 && 'border-t border-border',
              )}
            >
              <CredentialRow
                item={c}
                busy={busyId === c.id}
                onReveal={async () => {
                  setBusyId(c.id);
                  try {
                    const res = await fetch(
                      `/api/admin/credentials/${c.id}/reveal`,
                      { method: 'POST' },
                    );
                    const j = (await res.json()) as { secret?: string; error?: string };
                    if (!res.ok) throw new Error(j.error ?? 'Failed to reveal');
                    return j.secret ?? '';
                  } finally {
                    setBusyId(null);
                  }
                }}
                onEdit={() => setEditing(c)}
                onDelete={() => setConfirmingDelete(c)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <CredentialFormDialog
          title="New credential"
          initial={EMPTY_FORM}
          onCancel={() => setAdding(false)}
          onSubmit={async (form) => {
            const res = await fetch(
              `/api/admin/projects/${projectId}/credentials`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
              },
            );
            if (!res.ok) {
              const j = (await res.json().catch(() => ({}))) as {
                error?: string;
              };
              throw new Error(j.error ?? 'Failed to save');
            }
            setAdding(false);
            refresh();
          }}
        />
      ) : null}

      {editing ? (
        <CredentialFormDialog
          title="Edit credential"
          initial={{
            kind: editing.kind,
            label: editing.label,
            username: editing.username ?? '',
            url: editing.url ?? '',
            secret: '',
            notes: editing.notes ?? '',
            visible_to_client: editing.visibleToClient,
          }}
          secretHint="Leave blank to keep the existing secret."
          onCancel={() => setEditing(null)}
          onSubmit={async (form) => {
            const payload: Record<string, unknown> = { ...form };
            if (!form.secret) delete payload.secret;
            const res = await fetch(
              `/api/admin/credentials/${editing.id}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              },
            );
            if (!res.ok) {
              const j = (await res.json().catch(() => ({}))) as {
                error?: string;
              };
              throw new Error(j.error ?? 'Failed to save');
            }
            setEditing(null);
            refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmingDelete !== null}
        title="Delete credential?"
        description={
          confirmingDelete ? (
            <>
              <span className="font-sans text-sm text-ink">
                {confirmingDelete.label}
              </span>{' '}
              will be permanently removed.
            </>
          ) : null
        }
        confirmLabel="Delete"
        tone="danger"
        busy={busyId === confirmingDelete?.id}
        onCancel={() => setConfirmingDelete(null)}
        onConfirm={async () => {
          if (!confirmingDelete) return;
          setBusyId(confirmingDelete.id);
          try {
            const res = await fetch(
              `/api/admin/credentials/${confirmingDelete.id}`,
              { method: 'DELETE' },
            );
            if (!res.ok) return;
            setConfirmingDelete(null);
            refresh();
          } finally {
            setBusyId(null);
          }
        }}
      />
    </section>
  );
}

function CredentialRow({
  item,
  busy,
  onReveal,
  onEdit,
  onDelete,
}: {
  item: CredentialItem;
  busy: boolean;
  onReveal: () => Promise<string>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleReveal() {
    setError(null);
    try {
      const secret = await onReveal();
      setRevealed(secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reveal');
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
            {item.visibleToClient ? (
              <span className="rounded bg-success/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-success">
                Client visible
              </span>
            ) : (
              <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-subtle">
                Internal
              </span>
            )}
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
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReveal}
            disabled={busy}
          >
            {revealed ? 'Refresh' : 'Reveal'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      {revealed !== null ? (
        <div className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-3 py-2">
          <code className="flex-1 break-all font-mono text-xs text-ink">
            {revealed}
          </code>
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRevealed(null)}
          >
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

function CredentialFormDialog({
  title,
  initial,
  secretHint,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial: FormState;
  secretHint?: string;
  onCancel: () => void;
  onSubmit: (form: FormState) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(initial);
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
        <h2 className="font-display text-lg font-medium text-ink">{title}</h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cred_kind">Type</Label>
            <select
              id="cred_kind"
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
            <Label htmlFor="cred_label">Label</Label>
            <Input
              id="cred_label"
              required
              maxLength={200}
              value={form.label}
              onChange={(e) =>
                setForm((f) => ({ ...f, label: e.target.value }))
              }
            />
          </div>
        </div>

        {form.kind !== 'note' ? (
          <div className="space-y-1.5">
            <Label htmlFor="cred_username">Username / account</Label>
            <Input
              id="cred_username"
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
            <Label htmlFor="cred_url">URL</Label>
            <Input
              id="cred_url"
              type="url"
              maxLength={2000}
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="cred_secret">
            {form.kind === 'note' ? 'Note contents' : 'Secret'}
          </Label>
          <textarea
            id="cred_secret"
            rows={form.kind === 'note' ? 5 : 2}
            maxLength={20000}
            placeholder={secretHint ?? ''}
            required={!secretHint}
            value={form.secret}
            onChange={(e) =>
              setForm((f) => ({ ...f, secret: e.target.value }))
            }
            className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-ink"
          />
          {secretHint ? (
            <p className="font-sans text-xs text-ink-subtle">{secretHint}</p>
          ) : null}
        </div>

        {form.kind !== 'note' ? (
          <div className="space-y-1.5">
            <Label htmlFor="cred_notes">Notes</Label>
            <textarea
              id="cred_notes"
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

        <label className="flex items-start gap-3 rounded-lg bg-surface-2/60 px-3 py-2.5">
          <input
            type="checkbox"
            checked={form.visible_to_client}
            onChange={(e) =>
              setForm((f) => ({ ...f, visible_to_client: e.target.checked }))
            }
            className="mt-0.5 h-4 w-4 rounded border-border accent-copper"
          />
          <div className="min-w-0 flex-1">
            <p className="font-sans text-sm font-medium text-ink">
              Share with client
            </p>
            <p className="mt-0.5 font-sans text-xs text-ink-muted">
              When on, this credential appears in the client portal. They can
              reveal and copy it.
            </p>
          </div>
        </label>

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
