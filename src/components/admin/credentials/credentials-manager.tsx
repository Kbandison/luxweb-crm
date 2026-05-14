'use client';
import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SecretInput } from '@/components/ui/secret-input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import {
  CREDENTIAL_KINDS,
  CREDENTIAL_KIND_LABEL,
  type CredentialKind,
} from '@/lib/types/credential';
import { cn } from '@/lib/utils';

/**
 * Each credential kind has its own field shape — a password needs a
 * username + masked password input, an API key skips the username
 * entirely, a URL has no secret at all, etc. Centralized here so the
 * form can lay itself out off one lookup.
 */
type FieldConfig = {
  showUsername: boolean;
  usernameLabel?: string;
  usernamePlaceholder?: string;
  showUrl: boolean;
  urlLabel?: string;
  urlPlaceholder?: string;
  urlRequired?: boolean;
  showSecret: boolean;
  secretLabel?: string;
  secretRequired?: boolean;
  /** secret_note kinds want a multi-line input instead of single-line masked. */
  secretAsTextarea?: boolean;
  showNotes: boolean;
};

function fieldsFor(kind: CredentialKind): FieldConfig {
  switch (kind) {
    case 'password':
      return {
        showUsername: true,
        usernameLabel: 'Username / email',
        showUrl: true,
        urlLabel: 'Login URL',
        urlPlaceholder: 'https://app.example.com/login',
        showSecret: true,
        secretLabel: 'Password',
        secretRequired: true,
        showNotes: true,
      };
    case 'api_key':
      return {
        showUsername: false,
        showUrl: true,
        urlLabel: "Where it's used",
        urlPlaceholder: 'https://api.example.com',
        showSecret: true,
        secretLabel: 'API key',
        secretRequired: true,
        showNotes: true,
      };
    case 'url':
      return {
        showUsername: false,
        showUrl: true,
        urlLabel: 'URL',
        urlPlaceholder: 'https://example.com',
        urlRequired: true,
        showSecret: false,
        showNotes: true,
      };
    case 'sftp':
      return {
        showUsername: true,
        usernameLabel: 'SFTP user',
        showUrl: true,
        urlLabel: 'Host (with optional :port)',
        urlPlaceholder: 'sftp.example.com:22',
        showSecret: true,
        secretLabel: 'Password or key',
        secretRequired: true,
        showNotes: true,
      };
    case 'note':
      return {
        showUsername: false,
        showUrl: false,
        showSecret: true,
        secretLabel: 'Note',
        secretAsTextarea: true,
        secretRequired: true,
        showNotes: false,
      };
  }
}

export type CredentialItem = {
  id: string;
  kind: CredentialKind;
  label: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  visibleToClient: boolean;
  createdAt: string;
  /** True iff this credential was uploaded by the client. Admin can't edit. */
  createdByClient: boolean;
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
  const toast = useToast();
  // No local state for the list — render directly from the `initial`
  // server prop so router.refresh() actually picks up new rows. The
  // prior useState init froze the list at mount.
  const items = initial;
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
                issues?: { message: string; path?: (string | number)[] }[];
              };
              // Surface the first zod issue when available so the user
              // sees "URL must use http or https" instead of the generic
              // "Invalid payload".
              const issueMsg = j.issues?.[0]?.message;
              const msg = issueMsg ?? j.error ?? 'Failed to save';
              toast.error("Couldn't save credential", msg);
              throw new Error(msg);
            }
            setAdding(false);
            toast.success('Credential saved');
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
                issues?: { message: string; path?: (string | number)[] }[];
              };
              // Surface the first zod issue when available so the user
              // sees "URL must use http or https" instead of the generic
              // "Invalid payload".
              const issueMsg = j.issues?.[0]?.message;
              const msg = issueMsg ?? j.error ?? 'Failed to save';
              toast.error("Couldn't update credential", msg);
              throw new Error(msg);
            }
            setEditing(null);
            toast.success('Credential updated');
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
            if (!res.ok) {
              const j = (await res.json().catch(() => ({}))) as {
                error?: string;
              };
              toast.error(
                "Couldn't delete credential",
                j.error ?? 'Delete failed.',
              );
              return;
            }
            setConfirmingDelete(null);
            toast.success('Credential deleted');
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
            <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-meta-tight text-ink-muted">
              {CREDENTIAL_KIND_LABEL[item.kind]}
            </span>
            {item.visibleToClient ? (
              <span className="rounded bg-success/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-meta-tight text-success">
                Client visible
              </span>
            ) : (
              <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-meta-tight text-ink-subtle">
                Internal
              </span>
            )}
            {item.createdByClient ? (
              <span
                className="rounded bg-copper-soft/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-meta-tight text-copper"
                title="Uploaded by the client. You can reveal and delete, but not edit."
              >
                Client added
              </span>
            ) : null}
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
          {/* Edit is hidden for client-uploaded credentials — admin
              shouldn't be modifying a client's stored username/password. */}
          {!item.createdByClient ? (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
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
        <p className="font-mono text-[10px] uppercase tracking-meta-tight text-danger">
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
  const titleId = useId();

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
    <Dialog
      open
      onClose={onCancel}
      closeOnBackdropClick={!busy}
      closeOnEscape={!busy}
      labelledBy={titleId}
      panelClassName="w-full max-w-lg"
    >
      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-xl"
      >
        <h2 id={titleId} className="font-display text-lg font-medium text-ink">{title}</h2>

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
              placeholder={
                form.kind === 'note'
                  ? 'Internal note title'
                  : 'WordPress admin'
              }
              value={form.label}
              onChange={(e) =>
                setForm((f) => ({ ...f, label: e.target.value }))
              }
            />
          </div>
        </div>

        {(() => {
          const cfg = fieldsFor(form.kind);
          return (
            <>
              {cfg.showUsername ? (
                <div className="space-y-1.5">
                  <Label htmlFor="cred_username">
                    {cfg.usernameLabel ?? 'Username'}
                  </Label>
                  <Input
                    id="cred_username"
                    maxLength={500}
                    placeholder={cfg.usernamePlaceholder}
                    value={form.username}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, username: e.target.value }))
                    }
                  />
                </div>
              ) : null}

              {cfg.showUrl ? (
                <div className="space-y-1.5">
                  <Label htmlFor="cred_url">{cfg.urlLabel ?? 'URL'}</Label>
                  <Input
                    id="cred_url"
                    type={form.kind === 'url' ? 'url' : 'text'}
                    required={cfg.urlRequired}
                    maxLength={2000}
                    placeholder={cfg.urlPlaceholder}
                    value={form.url}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, url: e.target.value }))
                    }
                  />
                </div>
              ) : null}

              {cfg.showSecret ? (
                <div className="space-y-1.5">
                  <Label htmlFor="cred_secret">
                    {cfg.secretLabel ?? 'Secret'}
                  </Label>
                  {cfg.secretAsTextarea ? (
                    <textarea
                      id="cred_secret"
                      rows={5}
                      maxLength={20000}
                      placeholder={secretHint ?? ''}
                      required={cfg.secretRequired && !secretHint}
                      value={form.secret}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, secret: e.target.value }))
                      }
                      className="w-full rounded-md border border-border bg-bg px-3 py-2 font-sans text-sm text-ink"
                    />
                  ) : (
                    <SecretInput
                      id="cred_secret"
                      maxLength={20000}
                      placeholder={secretHint ?? ''}
                      required={cfg.secretRequired && !secretHint}
                      value={form.secret}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, secret: e.target.value }))
                      }
                    />
                  )}
                  {secretHint ? (
                    <p className="font-sans text-xs text-ink-subtle">
                      {secretHint}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {cfg.showNotes ? (
                <div className="space-y-1.5">
                  <Label htmlFor="cred_notes">Notes</Label>
                  <textarea
                    id="cred_notes"
                    rows={2}
                    maxLength={5000}
                    placeholder="Optional context — e.g. role, scope, recovery codes"
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 font-sans text-sm text-ink"
                  />
                </div>
              ) : null}
            </>
          );
        })()}

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
          <p className="font-mono text-[10px] uppercase tracking-meta-tight text-danger">
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
    </Dialog>
  );
}
