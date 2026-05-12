'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';

export type TagModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called with the trimmed, non-empty tag. The wrapper handles network + side-effects. */
  onSubmit: (tag: string) => Promise<void>;
  /** Selected-row count shown in the heading. */
  count: number;
};

/**
 * Single-field modal for applying a tag to a batch of contacts. The
 * <Dialog> primitive handles focus trap, escape, scroll lock — we just
 * provide the form. The submit handler resolves only after the parent's
 * network call completes, so the busy state is the source of truth.
 */
export function TagModal({ open, onClose, onSubmit, count }: TagModalProps) {
  const toast = useToast();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset internal state every time the modal opens so a previously-typed
  // tag doesn't bleed into the next session.
  useEffect(() => {
    if (open) {
      setTag('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  // Override the Dialog's default autofocus (which picks the first
  // focusable element — that would be the Cancel button) so the input is
  // ready to type into.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = tag.trim();
    if (!trimmed) {
      setError('Enter a tag.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to add tag.';
      setError(msg);
      toast.error("Couldn't add tag", msg);
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      labelledBy={titleId}
      closeOnBackdropClick={!busy}
      closeOnEscape={!busy}
      panelClassName="w-full max-w-md"
    >
      <form
        onSubmit={handleSubmit}
        className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_32px_80px_-20px_rgba(0,0,0,0.4)]"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-gradient-to-br from-copper/18 via-gold/8 to-transparent blur-2xl"
        />

        <div className="relative px-6 pb-5 pt-6">
          <h2
            id={titleId}
            className="font-display text-lg font-medium tracking-tight text-ink"
          >
            Add tag to {count} {count === 1 ? 'contact' : 'contacts'}
          </h2>
          <p className="mt-1 font-sans text-sm text-ink-muted">
            Existing tags on each contact are preserved.
          </p>

          <div className="mt-5 space-y-2">
            <Label htmlFor="bulk-tag-input">Tag</Label>
            <Input
              ref={inputRef}
              id="bulk-tag-input"
              type="text"
              value={tag}
              onChange={(e) => {
                setTag(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. priority"
              maxLength={40}
              disabled={busy}
              aria-invalid={error ? true : undefined}
              autoComplete="off"
            />
            {error ? (
              <p className="font-sans text-xs text-danger">{error}</p>
            ) : null}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface-2/40 px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={busy || tag.trim().length === 0}
          >
            {busy ? 'Adding…' : 'Add tag'}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
