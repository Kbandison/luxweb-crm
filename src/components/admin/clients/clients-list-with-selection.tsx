'use client';
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientRow } from '@/lib/queries/admin';
import type { SortDir } from '@/lib/list-params';
import { Button, buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { BulkActionBar } from '@/components/admin/bulk-action-bar';
import { TagModal } from '@/components/admin/tag-modal';
import { ClientsTable } from './clients-table';

/**
 * Wraps <ClientsTable> with row selection, the floating bulk action bar,
 * the tag modal, and an always-visible "Export CSV" button (page-level —
 * exports the full filtered set; the action bar's "Export selected" uses
 * the ids-only variant).
 */
export function ClientsListWithSelection({
  rows,
  currentSort,
  currentDir,
  searchParams,
  totalCount,
}: {
  rows: ClientRow[];
  currentSort: string;
  currentDir: SortDir;
  searchParams: Record<string, string | string[] | undefined>;
  totalCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [tagOpen, setTagOpen] = useState(false);

  const toggleRow = useCallback((id: string) => {
    setSelected((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((visible: ClientRow[]) => {
    setSelected((curr) => {
      const allSelected = visible.length > 0 && visible.every((r) => curr.has(r.id));
      if (allSelected) {
        // Deselect just the visible rows, preserve any off-screen ones.
        const next = new Set(curr);
        for (const r of visible) next.delete(r.id);
        return next;
      }
      // Add all visible to selection.
      const next = new Set(curr);
      for (const r of visible) next.add(r.id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  // Build CSV export URLs once per render so the anchors are stable.
  const exportAllHref = useMemo(() => {
    const sp = new URLSearchParams();
    const q = typeof searchParams.q === 'string' ? searchParams.q : '';
    if (q) sp.set('q', q);
    sp.set('sort', currentSort);
    sp.set('dir', currentDir);
    return `/api/admin/clients/export.csv?${sp.toString()}`;
  }, [searchParams, currentSort, currentDir]);

  const exportSelectedHref = useMemo(() => {
    const ids = Array.from(selected).join(',');
    return `/api/admin/clients/export.csv?ids=${encodeURIComponent(ids)}`;
  }, [selected]);

  async function submitTag(tag: string) {
    const ids = Array.from(selected);
    const res = await fetch('/api/admin/contacts/bulk-tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, tag }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Failed to add tag.');
    }
    const data = (await res.json()) as {
      updated: number;
      skipped: number;
    };
    toast.success(
      `Tagged ${data.updated} ${data.updated === 1 ? 'contact' : 'contacts'}`,
      data.skipped > 0
        ? `${data.skipped} already had this tag.`
        : undefined,
    );
    setTagOpen(false);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-surface px-6 pb-4 pt-6">
        <PageHeader
          title="Clients"
          description={`${totalCount} total`}
          actions={
            <a
              href={exportAllHref}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Export CSV
            </a>
          }
        />
      </div>

      <BulkActionBar
        count={selected.size}
        noun="clients selected"
        onClear={clear}
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setTagOpen(true)}
            >
              Add tag
            </Button>
            <a
              href={exportSelectedHref}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Export selected
            </a>
          </>
        }
      />

      <div className="min-h-0 flex-1">
        <ClientsTable
          initial={rows}
          currentSort={currentSort}
          currentDir={currentDir}
          searchParams={searchParams}
          selectedIds={selected}
          onToggleRow={toggleRow}
          onToggleAll={toggleAll}
        />
      </div>

      <TagModal
        open={tagOpen}
        onClose={() => setTagOpen(false)}
        onSubmit={submitTag}
        count={selected.size}
      />
    </div>
  );
}
