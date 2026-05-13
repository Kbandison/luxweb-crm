/**
 * Allowlist for client/admin file uploads.
 *
 * Why an allowlist rather than a denylist: when we hand out a Supabase
 * signed-URL for a file on `<our-project>.supabase.co`, the browser will
 * execute scripts inside HTML/SVG served from that path — and depending
 * on storage CDN cache headers, some of those responses share a sibling
 * origin. We sidestep the whole class of "what does the browser do with
 * this MIME" questions by only accepting types that browsers reliably
 * treat as inert content.
 *
 * The MIME check is the primary gate; the extension check catches the
 * case where a client lies about content_type. We require BOTH.
 */

// Exact MIME types we accept. Order is documentation, not behavior.
const ALLOWED_MIME = new Set<string>([
  // Images (no SVG — SVG can contain <script>)
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/bmp',
  'image/tiff',

  // PDFs + Office docs
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // Plain text variants
  'text/plain',
  'text/csv',
  'text/markdown',

  // Audio
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
  'audio/webm',

  // Video
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',

  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/x-rar-compressed',

  // Misc
  'application/json',
  'application/octet-stream', // ambiguous — extension check is doing the work
]);

// Extension allowlist — applied as a second gate. Anything not on this list
// is rejected regardless of declared content_type.
const ALLOWED_EXT = new Set<string>([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp', 'tif', 'tiff',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'md', 'csv',
  'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac',
  'mp4', 'mov', 'webm', 'avi', 'mkv',
  'zip', '7z', 'rar',
  'json',
  'psd', 'ai', 'sketch', 'fig', // design files (binary, no exec risk)
]);

export function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return '';
  return fileName.slice(dot + 1).toLowerCase();
}

export function isAllowedMime(mime: string | null | undefined): boolean {
  if (!mime) return true; // null/empty handled by extension check
  return ALLOWED_MIME.has(mime.toLowerCase());
}

export function isAllowedExtension(fileName: string): boolean {
  const ext = getExtension(fileName);
  if (!ext) return false;
  return ALLOWED_EXT.has(ext);
}

/**
 * Combined gate used by both /api/admin/files/sign and /api/client/files/sign.
 * Rejects:
 *   - any disallowed extension (HTML, SVG, JS, shell scripts, executables…)
 *   - any disallowed MIME (text/html, image/svg+xml, application/javascript…)
 */
export function isAllowedUpload(
  fileName: string,
  contentType: string | null | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!isAllowedExtension(fileName)) {
    return {
      ok: false,
      reason: `File type ".${getExtension(fileName) || '(none)'}" is not allowed`,
    };
  }
  if (!isAllowedMime(contentType)) {
    return {
      ok: false,
      reason: `Content type "${contentType}" is not allowed`,
    };
  }
  return { ok: true };
}
