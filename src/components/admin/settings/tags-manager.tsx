'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TagUsage } from '@/lib/queries/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export function TagsManager({ tags }: { tags: TagUsage[] }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState<TagUsage | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<TagUsage | null>(null);
  const [busy, setBusy] = useState(false);

  async function rename() {
    if (!renaming) return;
    const next = renameValue.trim();
    if (!next || next === renaming.tag) {
      setRenaming(null);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/tags/${encodeURIComponent(renaming.tag)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_name: next }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Rename failed');
        return;
      }
      setRenaming(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/tags/${encodeURIComponent(deleting.tag)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Delete failed');
        return;
      }
      setDeleting(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full">
          <thead className="border-b border-border bg-surface text-left">
            <tr className="font-mono text-[10px] uppercase tracking-meta text-ink-muted">
              <th className="px-5 py-3 font-medium">Tag</th>
              <th className="px-3 py-3 text-right font-medium">Used by</th>
              <th className="w-40 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {tags.map((t) => (
              <tr
                key={t.tag}
                className="border-b border-border bg-surface last:border-b-0 hover:bg-surface-2/40"
              >
                <td className="px-5 py-3 font-sans text-sm text-ink">
                  <span className="inline-flex items-center rounded-full border border-border bg-surface-2/40 px-2 py-0.5 font-mono text-xs text-ink-muted">
                    {t.tag}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-ink-muted">
                  {t.count}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRenaming(t);
                        setRenameValue(t.tag);
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleting(t)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={renaming !== null}
        onClose={() => (busy ? undefined : setRenaming(null))}
        labelledBy="tag-rename-title"
        panelClassName="w-full max-w-md"
      >
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2
            id="tag-rename-title"
            className="font-display text-lg font-medium text-ink"
          >
            Rename tag
          </h2>
          <p className="mt-2 font-sans text-sm text-ink-muted">
            Renaming{' '}
            <span className="font-mono text-ink">{renaming?.tag}</span> updates
            it on every contact that carries it (
            {renaming?.count} total).
          </p>
          <Input
            className="mt-4"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="New tag name"
            autoFocus
          />
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRenaming(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={rename} disabled={busy}>
              {busy ? 'Renaming…' : 'Rename'}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        title="Delete tag?"
        description={
          <>
            Removes{' '}
            <span className="font-mono text-ink">{deleting?.tag}</span> from{' '}
            {deleting?.count} contact{deleting?.count === 1 ? '' : 's'}.
            Contacts themselves stay.
          </>
        }
        confirmLabel="Delete tag"
        busy={busy}
        onCancel={() => (busy ? undefined : setDeleting(null))}
        onConfirm={destroy}
      />
    </>
  );
}
