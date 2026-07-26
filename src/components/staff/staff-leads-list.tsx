'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ContactRow } from '@/lib/queries/admin';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { LeadScore } from '@/components/admin/leads/lead-score';
import { EditContactDrawer } from '@/components/admin/contacts/edit-contact-drawer';

/**
 * A contractor's own leads. Reuses the shared contact drawers pointed at the
 * owner-scoped /api/staff/leads endpoints (create/edit/delete only touch
 * leads the contractor owns).
 */
export function StaffLeadsList({ leads }: { leads: ContactRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirming = leads.find((l) => l.id === confirmId) ?? null;

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/leads/${id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't delete", body.error ?? 'Try again.');
        return;
      }
      toast.success('Lead deleted');
      setConfirmId(null);
      router.refresh();
    } catch {
      toast.error("Couldn't delete", 'Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (leads.length === 0) {
    return (
      <EmptyState
        title="No leads yet"
        description="Add a lead with the button above — it's yours, and the studio sees it too."
      />
    );
  }

  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {leads.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-sans text-sm font-medium text-ink">
                  {l.fullName}
                </p>
                <LeadScore score={l.leadScore} />
              </div>
              <p className="mt-0.5 truncate font-sans text-xs text-ink-muted">
                {[l.company, l.email].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <EditContactDrawer
                contactId={l.id}
                apiBase="/api/staff/leads"
                initial={{
                  fullName: l.fullName,
                  email: l.email,
                  phone: l.phone,
                  company: l.company,
                  source: l.source,
                  tags: l.tags,
                  leadScore: l.leadScore,
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmId(l.id)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? `Delete ${confirming.fullName}?` : ''}
        description="This removes the lead and its pipeline entry. This can't be undone."
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        onConfirm={() => {
          if (confirming) void remove(confirming.id);
        }}
        onCancel={() => setConfirmId(null)}
      />
    </>
  );
}
