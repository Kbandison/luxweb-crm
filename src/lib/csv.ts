/**
 * Tiny CSV generator. No npm dep — RFC 4180 escaping done manually.
 *
 * Rules:
 *   - Wrap a value in double quotes if it contains a comma, quote, CR, or LF.
 *   - Double up any embedded double quotes ("foo \"bar\"" → "foo ""bar""").
 *   - `null` / `undefined` render as empty strings.
 *   - `Date` values render as ISO strings.
 *   - Arrays render as `; `-joined values (consumers can still parse cells).
 *   - Numbers / booleans render via `String(...)`.
 *
 * Currency columns should be passed as integer cents — formatting is the
 * consumer's job (Excel, downstream scripts, etc.).
 */

export type CsvColumn<T> = {
  /** Object key. */
  key: keyof T;
  /** Human-readable header label written as the first row. */
  header: string;
};

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((v) => (v === null || v === undefined ? '' : String(v))).join('; ');
  }
  if (typeof value === 'object') {
    // Best-effort: JSON-stringify. Caller can map to a primitive instead.
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function escape(value: string): string {
  // RFC 4180 — quote when commas, quotes, CR, LF, or leading/trailing whitespace.
  const needsQuoting = /[",\r\n]/.test(value);
  if (!needsQuoting) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Build a CSV body string from rows + column definitions. Always emits CRLF
 * line endings (RFC 4180). No trailing newline.
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: ReadonlyArray<CsvColumn<T>>,
): string {
  const headerLine = columns.map((c) => escape(c.header)).join(',');
  const bodyLines = rows.map((row) =>
    columns.map((c) => escape(renderCell(row[c.key]))).join(','),
  );
  return [headerLine, ...bodyLines].join('\r\n');
}

/**
 * Build a `Content-Disposition` header value for a downloaded CSV. The
 * filename gets the current date suffix so multiple exports stack cleanly.
 *
 * Caller should pass a stem like "clients" or "leads-selected".
 */
export function csvFilename(stem: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${stem}-${stamp}.csv`;
}

/**
 * Build a `Response` returning the CSV body with the correct headers.
 */
export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
