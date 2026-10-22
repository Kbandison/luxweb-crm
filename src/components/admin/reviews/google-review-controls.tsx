'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import type { ContactChoice } from '@/lib/queries/google-reviews';

const SITE_CHOICES = [
  { value: 'auto', label: 'Automatic (4–5 stars with text)' },
  { value: 'show', label: 'Always show' },
  { value: 'hide', label: 'Never show' },
] as const;

type SiteChoice = (typeof SITE_CHOICES)[number]['value'];

function toChoice(v: boolean | null): SiteChoice {
  return v === null ? 'auto' : v ? 'show' : 'hide';
}

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-border bg-surface px-3 font-sans text-sm text-ink focus:border-copper focus:outline-none disabled:opacity-50';

export function GoogleReviewControls({
  reviewId,
  showOnSite,
  contactId,
  contacts,
}: {
  reviewId: string;
  showOnSite: boolean | null;
  contactId: string | null;
  contacts: ContactChoice[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function save(patch: { show_on_site?: boolean | null; contact_id?: string | null }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/google-reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error("Couldn't save", j.error ?? 'Failed to save');
        return;
      }
      toast.success('Saved');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`site-${reviewId}`}>On luxwebstudio.dev</Label>
        <select
          id={`site-${reviewId}`}
          value={toChoice(showOnSite)}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value as SiteChoice;
            save({ show_on_site: v === 'auto' ? null : v === 'show' });
          }}
          className={SELECT_CLASS}
        >
          {SITE_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`client-${reviewId}`}>Client</Label>
        <select
          id={`client-${reviewId}`}
          value={contactId ?? ''}
          disabled={busy}
          onChange={(e) => save({ contact_id: e.target.value || null })}
          className={SELECT_CLASS}
        >
          <option value="">Not linked to a client</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
