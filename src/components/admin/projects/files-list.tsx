'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectFile } from '@/lib/queries/admin';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FilePreview } from './file-preview';
import { formatDateTime } from '@/lib/formatters';

const MAX_BYTES = 50 * 1024 * 1024;
const BUCKET = 'project-files';

type UploadingItem = {
  id: string;
  fileName: string;
  sizeBytes: number;
  progress: 'signing' | 'uploading' | 'failed';
};

export function FilesList({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ProjectFile[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState<UploadingItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewFile = previewId ? initial.find((f) => f.id === previewId) : null;
  const [confirmingFile, setConfirmingFile] = useState<ProjectFile | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  async function uploadFile(file: File) {
    if (file.size > MAX_BYTES) {
      setError(`“${file.name}” is larger than 50MB.`);
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
      // 1. Ask the server for a signed upload URL + pre-created DB row.
      const signRes = await fetch('/api/admin/files/sign', {
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

      // 2. Upload the file directly to Supabase Storage.
      const { error: upErr } = await supabaseBrowser()
        .storage.from(BUCKET)
        .uploadToSignedUrl(path, token, file);

      if (upErr) {
        // Roll back the DB row so we don't orphan.
        await fetch(`/api/admin/files/${id}`, { method: 'DELETE' });
        throw new Error(upErr.message);
      }

      setUploading((u) => u.filter((x) => x.id !== tmpId));
      router.refresh();
    } catch (e) {
      setUploading((u) =>
        u.map((x) => (x.id === tmpId ? { ...x, progress: 'failed' } : x)),
      );
      setError(e instanceof Error ? e.message : 'Upload failed.');
    }
  }

  function onFilesPicked(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((f) => void uploadFile(f));
    if (inputRef.current) inputRef.current.value = '';
  }

  async function toggleVisible(f: ProjectFile) {
    setPendingId(f.id);
    await fetch(`/api/admin/files/${f.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_client_visible: !f.isClientVisible }),
    });
    setPendingId(null);
    router.refresh();
  }

  async function confirmDelete() {
    if (!confirmingFile) return;
    setConfirmBusy(true);
    setPendingId(confirmingFile.id);
    try {
      await fetch(`/api/admin/files/${confirmingFile.id}`, { method: 'DELETE' });
    } finally {
      setConfirmBusy(false);
      setPendingId(null);
      setConfirmingFile(null);
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
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-subtle">
          Up to 50MB per file · Stored in project-files
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
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-copper">
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
        <div className="rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
          <p className="font-sans text-sm text-ink-muted">
            No files. Drop one above to get started.
          </p>
        </div>
      ) : initial.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-border bg-surface text-left">
              <tr className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-3 py-3 text-right font-medium">Size</th>
                <th className="px-3 py-3 font-medium">Visibility</th>
                <th className="px-3 py-3 font-medium">Uploaded</th>
                <th className="w-44 px-5 py-3 text-right" />
              </tr>
            </thead>
            <tbody>
              {initial.map((f) => (
                <tr
                  key={f.id}
                  className={cn(
                    'border-b border-border last:border-b-0 transition-opacity',
                    pendingId === f.id && 'opacity-50',
                  )}
                >
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={() => setPreviewId(f.id)}
                      className="flex w-full items-center gap-3 text-left transition-colors hover:text-copper"
                    >
                      <FileGlyph type={f.contentType} />
                      <div className="min-w-0">
                        <p className="truncate font-sans text-sm font-medium text-ink group-hover:text-copper">
                          {f.fileName}
                        </p>
                        {f.contentType ? (
                          <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
                            {f.contentType}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                    {formatBytes(f.sizeBytes)}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]',
                        f.isClientVisible
                          ? 'bg-success/15 text-success'
                          : 'bg-copper-soft/60 text-copper',
                      )}
                    >
                      {f.isClientVisible ? '◐ Client' : '🔒 Internal'}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs tabular-nums text-ink-muted">
                    <div>{formatDateTime(f.createdAt)}</div>
                    <div className="text-[10px] text-ink-subtle">
                      {f.uploadedByEmail ?? 'system'}
                    </div>
                  </td>
                  <td className="py-3 pr-5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPreviewId(f.id)}
                        className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
                      >
                        Preview
                      </button>
                      <a
                        href={`/api/admin/files/${f.id}/download`}
                        className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        onClick={() => toggleVisible(f)}
                        disabled={pendingId === f.id}
                        className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:border-border-strong hover:text-ink disabled:opacity-50"
                      >
                        {f.isClientVisible ? 'Hide' : 'Reveal'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingFile(f)}
                        disabled={pendingId === f.id}
                        className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {previewFile ? (
        <FilePreview file={previewFile} onClose={() => setPreviewId(null)} />
      ) : null}

      <ConfirmDialog
        open={confirmingFile !== null}
        tone="danger"
        title="Delete file"
        description={
          confirmingFile ? (
            <>
              <span className="font-mono text-ink">{confirmingFile.fileName}</span>{' '}
              will be permanently removed from Supabase Storage and from this
              project. This can&apos;t be undone.
            </>
          ) : null
        }
        confirmLabel="Delete file"
        busy={confirmBusy}
        onCancel={() => (confirmBusy ? undefined : setConfirmingFile(null))}
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
