'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/** Minimal RFC-4180-ish CSV parser (handles quotes, commas, newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      /* ignore */
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// header (normalized) → field. First match wins.
const FIELD_MATCHERS: Array<[RegExp, string]> = [
  [/^(contactname|name|contact)$/, 'full_name'],
  [/^(businessname|business|company)$/, 'company'],
  [/^(phone|phonenumber|number)$/, 'phone'],
  [/^(email|emailaddress)$/, 'email'],
  [/^(industry|niche)$/, 'industry'],
  [/(websiteproblem|problemspotted|problem|angle)/, 'website_problem'],
  [/^(source|leadsource)$/, 'source'],
  [/(notes|whattheyactuallysaid|said|comment)/, 'notes'],
];

function mapHeaders(headers: string[]): (string | null)[] {
  return headers.map((h) => {
    const n = norm(h);
    for (const [re, field] of FIELD_MATCHERS) if (re.test(n)) return field;
    return null;
  });
}

type ImportResult = {
  imported: number;
  skipped: number;
  skippedOther: number;
  heldBy?: string[];
};

/** Name the setters whose lists caused skips — that's the useful part. */
function skipMessage(r: ImportResult): string | undefined {
  if (!r.skipped) return undefined;
  const base = `${r.skipped} skipped as duplicates`;
  if (!r.skippedOther) return `${base}.`;
  const who = r.heldBy?.length ? ` — already on ${r.heldBy.join(', ')}'s list` : '';
  return `${base} (${r.skippedOther} already being called${who}).`;
}

export function OutreachImportButton() {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const grid = parseCsv(text).filter((r) => r.some((c) => c.trim()));
      if (grid.length < 2) {
        toast.error('Empty file', 'No rows found under the header.');
        return;
      }
      const fieldByCol = mapHeaders(grid[0]);
      if (!fieldByCol.includes('full_name')) {
        toast.error(
          'No name column',
          'Add a "Contact Name" (or "Name") column and try again.',
        );
        return;
      }
      const rows = grid.slice(1).map((cells) => {
        const rec: Record<string, string> = {};
        fieldByCol.forEach((field, i) => {
          if (field && cells[i]?.trim()) rec[field] = cells[i].trim();
        });
        return rec;
      }).filter((r) => r.full_name);

      if (rows.length === 0) {
        toast.error('Nothing to import', 'No rows had a contact name.');
        return;
      }

      const res = await fetch('/api/outreach/prospects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't import", body.error ?? 'Try again.');
        return;
      }
      toast.success(`Imported ${body.imported}`, skipMessage(body));
      router.refresh();
    } catch {
      toast.error("Couldn't import", 'Could not read the file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onFile}
        className="hidden"
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Importing…' : 'Import CSV'}
      </Button>
    </>
  );
}
