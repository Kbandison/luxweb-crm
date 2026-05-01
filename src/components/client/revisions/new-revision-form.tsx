'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type MilestoneOption = {
  id: string;
  title: string;
};

export function NewRevisionForm({
  projectId,
  milestones,
}: {
  projectId: string;
  milestones: MilestoneOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [milestoneId, setMilestoneId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/client/projects/${projectId}/revisions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            body: body.trim(),
            milestone_id: milestoneId || null,
          }),
        },
      );
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Failed to submit');
        return;
      }
      setTitle('');
      setBody('');
      setMilestoneId('');
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>Request a revision</Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-copper/30 bg-copper-soft/30 p-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-medium text-ink">
          New revision request
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-copper"
          disabled={busy}
        >
          ← Cancel
        </button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rev_title">Title</Label>
        <Input
          id="rev_title"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short summary of the change"
        />
      </div>

      {milestones.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="rev_milestone">Related to (optional)</Label>
          <select
            id="rev_milestone"
            value={milestoneId}
            onChange={(e) => setMilestoneId(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-bg px-3 font-sans text-sm text-ink"
          >
            <option value="">— No specific milestone —</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="rev_body">Details</Label>
        <textarea
          id="rev_body"
          required
          rows={5}
          maxLength={10000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What would you like changed? Be as specific as possible."
          className="w-full rounded-md border border-border bg-bg px-3 py-2 font-sans text-sm text-ink"
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 font-sans text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit request'}
        </Button>
      </div>
    </form>
  );
}
