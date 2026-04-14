'use client';
import { useState } from 'react';
import type { ClientFile } from '@/lib/queries/client';
import { cn } from '@/lib/utils';
import { FilePreview } from '@/components/admin/projects/file-preview';
import { formatDate } from '@/lib/formatters';

// Client-side preview reuses the admin preview component by mapping to its
// expected shape — client files don't carry admin-only fields.
type PreviewShape = {
  id: string;
  projectId: string;
  fileName: string;
  storagePath: string;
  sizeBytes: number;
  contentType: string | null;
  uploadedById: string | null;
  uploadedByEmail: string | null;
  isClientVisible: boolean;
  createdAt: string;
  previewUrl: string | null;
};

export function ClientFilesList({ initial }: { initial: ClientFile[] }) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewFile = previewId
    ? initial.find((f) => f.id === previewId)
    : null;

  if (initial.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/60 p-10 text-center">
        <p className="font-sans text-sm text-ink-muted">
          No files shared. Anything the team publishes for you will appear
          here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
        {initial.length} {initial.length === 1 ? 'file' : 'files'}
      </p>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <ul className="divide-y divide-border">
          {initial.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50"
            >
              <FileGlyph type={f.contentType} />
              <button
                type="button"
                onClick={() => setPreviewId(f.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate font-sans text-sm font-medium text-ink hover:text-copper">
                  {f.fileName}
                </p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
                  {formatDate(f.createdAt)} · {formatBytes(f.sizeBytes)}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setPreviewId(f.id)}
                className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
              >
                Preview
              </button>
              {f.previewUrl ? (
                <a
                  href={f.previewUrl}
                  download
                  className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
                >
                  Download
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {previewFile ? (
        <FilePreview
          file={
            {
              id: previewFile.id,
              projectId: '',
              fileName: previewFile.fileName,
              storagePath: '',
              sizeBytes: previewFile.sizeBytes,
              contentType: previewFile.contentType,
              uploadedById: null,
              uploadedByEmail: null,
              isClientVisible: true,
              createdAt: previewFile.createdAt,
              previewUrl: previewFile.previewUrl,
            } as PreviewShape
          }
          onClose={() => setPreviewId(null)}
        />
      ) : null}
    </div>
  );
}

function FileGlyph({ type }: { type: string | null }) {
  const isImage = type?.startsWith('image/');
  const isPdf = type === 'application/pdf';
  return (
    <div
      aria-hidden
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
        isPdf
          ? 'bg-danger/10 text-danger'
          : isImage
            ? 'bg-info/10 text-info'
            : 'bg-surface-2 text-ink-muted',
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
