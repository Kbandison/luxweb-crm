'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientFile } from '@/lib/queries/client';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { FilePreview } from '@/components/admin/projects/file-preview';
import { formatDate } from '@/lib/formatters';

const MAX_BYTES = 50 * 1024 * 1024;
const BUCKET = 'project-files';

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

type UploadingItem = {
  id: string;
  fileName: string;
  sizeBytes: number;
  progress: 'signing' | 'uploading' | 'failed';
};

export function ClientFilesList({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ClientFile[];
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState<UploadingItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ClientFile | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const previewFile = previewId
    ? initial.find((f) => f.id === previewId)
    : null;

  async function uploadFile(file: File) {
    if (file.size > MAX_BYTES) {
      setError(`"${file.name}" is larger than 50MB.`);
      return;
    }
    const tmpId = `tmp-${Date.now()}-${file.name}`;
    setUploading((u) => [
      ...u,
      {
        id: tmpId,
        fileName: file.name,
        sizeBytes: file.size,
        progress: 'signing',
      },
    ]);
    setError(null);

    try {
      const signRes = await fetch('/api/client/files/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          file_name: file.name,
          size_bytes: file.size,
          content_type: file.type || null,
        }),
      });
      if (!signRes.ok) {
        const j = await signRes.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to sign upload.');
      }
      const { id, path, token } = (await signRes.json()) as {
        id: string;
        path: string;
        token: string;
      };

      setUploading((u) =>
        u.map((x) => (x.id === tmpId ? { ...x, progress: 'uploading' } : x)),
      );

      const { error: upErr } = await supabaseBrowser()
        .storage.from(BUCKET)
        .uploadToSignedUrl(path, token, file);

      if (upErr) {
        // Roll back the orphaned DB row.
        await fetch(`/api/client/files/${id}`, { method: 'DELETE' });
        throw new Error(upErr.message);
      }

      setUploading((u) => u.filter((x) => x.id !== tmpId));
      toast.success('File uploaded', file.name);
      router.refresh();
    } catch (e) {
      setUploading((u) =>
        u.map((x) => (x.id === tmpId ? { ...x, progress: 'failed' } : x)),
      );
      const msg = e instanceof Error ? e.message : 'Upload failed.';
      setError(msg);
      toast.error("Couldn't upload file", msg);
    }
  }

  function onFilesPicked(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((f) => void uploadFile(f));
    if (inputRef.current) inputRef.current.value = '';
  }

  async function confirmDelete() {
    if (!confirming) return;
    setConfirmBusy(true);
    try {
      const res = await fetch(`/api/client/files/${confirming.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error("Couldn't delete file", j.error ?? 'Delete failed.');
      } else {
        toast.success('File deleted');
      }
    } finally {
      setConfirmBusy(false);
      setConfirming(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFilesPicked(e.dataTransfer.files);
        }}
        className={cn(
          'relative overflow-hidden rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          dragging
            ? 'border-copper/60 bg-copper-soft/25'
            : 'border-border bg-surface',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onFilesPicked(e.target.files)}
        />
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-copper/15 via-copper-soft/50 to-transparent ring-1 ring-copper/15">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 text-copper/70"
            aria-hidden
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p className="mt-4 font-display text-base font-medium text-ink">
          Drop files here, or{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-copper hover:underline"
          >
            browse
          </button>
        </p>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-meta text-ink-subtle">
          Up to 50MB per file · Shared with the team
        </p>

        {error ? (
          <p
            role="alert"
            className="mt-3 font-sans text-xs text-danger"
          >
            {error}
          </p>
        ) : null}
      </div>

      {/* In-flight uploads */}
      {uploading.length > 0 ? (
        <ul className="space-y-2">
          {uploading.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-copper/30 bg-copper-soft/20 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans text-sm font-medium text-ink">
                  {u.fileName}
                </p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-meta text-copper">
                  {u.progress === 'signing' ? 'Preparing upload…' : null}
                  {u.progress === 'uploading'
                    ? `Uploading · ${formatBytes(u.sizeBytes)}`
                    : null}
                  {u.progress === 'failed' ? 'Failed — try again' : null}
                </p>
              </div>
              {u.progress !== 'failed' ? (
                <div className="h-1 w-16 overflow-hidden rounded-full bg-border">
                  <div className="h-full w-full animate-pulse rounded-full bg-copper" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Files list */}
      {initial.length === 0 && uploading.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/60 p-10 text-center">
          <p className="font-sans text-sm text-ink-muted">
            No files yet. Drop one above to share it with the team.
          </p>
        </div>
      ) : initial.length > 0 ? (
        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-meta text-ink-muted">
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
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-meta-tight text-ink-subtle">
                      {formatDate(f.createdAt)} · {formatBytes(f.sizeBytes)}
                      {f.uploadedByMe ? ' · By you' : null}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewId(f.id)}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-meta-tight text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
                  >
                    Preview
                  </button>
                  {f.previewUrl ? (
                    <a
                      href={f.previewUrl}
                      download
                      className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-meta-tight text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
                    >
                      Download
                    </a>
                  ) : null}
                  {f.uploadedByMe ? (
                    <button
                      type="button"
                      onClick={() => setConfirming(f)}
                      className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-meta-tight text-ink-muted transition-colors hover:border-danger/40 hover:text-danger"
                    >
                      Delete
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

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

      <ConfirmDialog
        open={confirming !== null}
        tone="danger"
        title="Delete file"
        description={
          confirming ? (
            <>
              Remove <span className="font-mono text-ink">{confirming.fileName}</span>?
              This can&apos;t be undone.
            </>
          ) : null
        }
        confirmLabel="Delete file"
        busy={confirmBusy}
        onCancel={() => (confirmBusy ? undefined : setConfirming(null))}
        onConfirm={confirmDelete}
      />
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
