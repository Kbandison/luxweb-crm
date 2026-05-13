'use client';
import { useId } from 'react';
import type { ProjectFile } from '@/lib/queries/admin';
import { buttonVariants } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type Kind = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'other';

export function FilePreview({
  file,
  onClose,
}: {
  file: ProjectFile;
  onClose: () => void;
}) {
  const headingId = useId();
  const kind = kindFor(file.contentType, file.fileName);
  // Prefer the pre-signed URL generated at page load (direct to Supabase —
  // no redirect). Fall back to our API if signing failed server-side.
  const inlineSrc =
    file.previewUrl ?? `/api/admin/files/${file.id}/download?inline=1`;
  const downloadSrc = `/api/admin/files/${file.id}/download`;

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy={headingId}
      closeOnBackdropClick
      closeOnEscape
      className="bg-ink/60 backdrop-blur-sm md:p-8"
      panelClassName="w-full max-w-5xl"
    >
      <div
        className="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_32px_80px_-20px_rgba(0,0,0,0.4)]"
      >
        {/* Header */}
        <header className="relative isolate flex items-center justify-between gap-3 overflow-hidden border-b border-border px-6 py-4">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-copper/18 via-gold/8 to-transparent blur-2xl"
          />
          <div className="relative min-w-0 flex-1">
            <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
              Preview
            </p>
            <h2
              id={headingId}
              className="mt-0.5 truncate font-display text-lg font-medium tracking-tight text-ink"
            >
              {file.fileName}
            </h2>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
              {file.contentType ?? 'unknown'} · {formatBytes(file.sizeBytes)}
            </p>
          </div>
          <div className="relative flex items-center gap-2">
            <a
              href={downloadSrc}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Download
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md border border-border bg-surface p-2 text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        {/* Body */}
        <div
          className={cn(
            'relative flex-1 overflow-auto',
            kind === 'image'
              ? 'bg-ink/5'
              : kind === 'pdf' || kind === 'video'
                ? 'bg-ink/80'
                : 'bg-surface-2',
          )}
        >
          {kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={inlineSrc}
              alt={file.fileName}
              className="mx-auto block max-h-[80vh] max-w-full object-contain"
            />
          ) : null}

          {kind === 'pdf' ? (
            <iframe
              src={inlineSrc}
              title={file.fileName}
              className="h-[80vh] w-full border-0"
            />
          ) : null}

          {kind === 'video' ? (
            <video
              src={inlineSrc}
              controls
              className="mx-auto block max-h-[80vh] max-w-full"
            />
          ) : null}

          {kind === 'audio' ? (
            <div className="flex h-40 items-center justify-center">
              <audio src={inlineSrc} controls />
            </div>
          ) : null}

          {kind === 'text' ? (
            <iframe
              src={inlineSrc}
              title={file.fileName}
              className="h-[70vh] w-full border-0 bg-surface"
            />
          ) : null}

          {kind === 'other' ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-8 py-16 text-center">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-copper/15 via-copper-soft/50 to-transparent ring-1 ring-copper/15">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6 text-copper/70"
                  aria-hidden
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="space-y-1">
                <p className="font-display text-base font-medium text-ink">
                  No inline preview available
                </p>
                <p className="mx-auto max-w-sm font-sans text-sm text-ink-muted">
                  This file type can&apos;t render in the browser. Download it
                  to open.
                </p>
              </div>
              <a
                href={downloadSrc}
                className={buttonVariants({ variant: 'primary', size: 'sm' })}
              >
                Download
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

function kindFor(contentType: string | null, fileName: string): Kind {
  const t = (contentType ?? '').toLowerCase();
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  if (t.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext))
    return 'image';
  if (t === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (t.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (t.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return 'audio';
  if (t.startsWith('text/') || ['txt', 'md', 'csv', 'log'].includes(ext)) return 'text';
  return 'other';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
