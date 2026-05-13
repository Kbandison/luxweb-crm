'use client';
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ContactRow } from '@/lib/queries/admin';
import type { SortDir } from '@/lib/list-params';
import { Button, buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { BulkActionBar } from '@/components/admin/bulk-action-bar';
import { TagModal } from '@/components/admin/tag-modal';
import { LeadsList } from './leads-list';

/**
 * Selection wrapper around <LeadsList>. Mirrors the clients wrapper —
 * tag modal, bulk action bar, two export buttons (all-filtered + selected).
 */
export function LeadsListWithSelection({
  rows,
  selectedId,
  currentSort,
  currentDir,
  searchParams,
  totalCount,
  newLeadSlot,
}: {
  rows: ContactRow[];
  selectedId: string | null;
  currentSort: string;
  currentDir: SortDir;
  searchParams: Record<string, string | string[] | undefined>;
  totalCount: number;
  newLeadSlot?: React.ReactNode;
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

  const toggleAll = useCallback((visible: ContactRow[]) => {
    setSelected((curr) => {
      const allSelected = visible.length > 0 && visible.every((r) => curr.has(r.id));
      if (allSelected) {
        const next = new Set(curr);
        for (const r of visible) next.delete(r.id);
        return next;
      }
      const next = new Set(curr);
      for (const r of visible) next.add(r.id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const exportAllHref = useMemo(() => {
    const sp = new URLSearchParams();
    const q = typeof searchParams.q === 'string' ? searchParams.q : '';
    if (q) sp.set('q', q);
    sp.set('sort', currentSort);
    sp.set('dir', currentDir);
    return `/api/admin/leads/export.csv?${sp.toString()}`;
  }, [searchParams, currentSort, currentDir]);

  const exportSelectedHref = useMemo(() => {
    const ids = Array.from(selected).join(',');
    return `/api/admin/leads/export.csv?ids=${encodeURIComponent(ids)}`;
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
      <div className="border-b border-border bg-surface px-4 pb-4 pt-6">
        <PageHeader
          title="Leads"
          description={`${totalCount} total`}
          actions={
            <>
              <a
                href={exportAllHref}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                Export CSV
              </a>
              {newLeadSlot}
            </>
          }
        />
      </div>

      <BulkActionBar
        count={selected.size}
        noun="leads selected"
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
        <LeadsList
          initial={rows}
          selectedId={selectedId}
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
