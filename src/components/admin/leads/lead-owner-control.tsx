'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import type { LeadOwnerOption } from '@/lib/queries/admin';

/**
 * Owner chip + reassign dropdown for a lead. Assign to any team member who
 * can own leads, or unassign. Optimistic label; the server refresh confirms.
 */
export function LeadOwnerControl({
  contactId,
  currentOwnerId,
  currentOwnerName,
  owners,
}: {
  contactId: string;
  currentOwnerId: string | null;
  currentOwnerName: string | null;
  owners: LeadOwnerOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  async function reassign(next: string) {
    const ownerId = next || null;
    if (ownerId === (currentOwnerId ?? null)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/contacts/${contactId}/owner`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: ownerId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't reassign", body.error ?? 'Try again.');
        return;
      }
      const name = owners.find((o) => o.userId === ownerId)?.name;
      toast.success('Owner updated', name ? `Assigned to ${name}.` : 'Unassigned.');
      startTransition(() => router.refresh());
    } catch {
      toast.error("Couldn't reassign", 'Network error. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="inline-flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
        Owner
      </span>
      <select
        aria-label="Lead owner"
        value={currentOwnerId ?? ''}
        disabled={saving || pending}
        onChange={(e) => reassign(e.target.value)}
        className="rounded-md border border-border bg-surface px-2 py-1 font-sans text-xs text-ink hover:border-border-strong focus:border-copper focus:outline-none disabled:opacity-50"
      >
        <option value="">
          {currentOwnerName ? 'Unassign' : 'Unassigned'}
        </option>
        {owners.map((o) => (
          <option key={o.userId} value={o.userId}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
