'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { MAX_IMPORT_ROWS, parseCsv } from '@/lib/outreach/csv-import';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// header (normalized) → field. First match wins.
const FIELD_MATCHERS: Array<[RegExp, string]> = [
  [/^(contactname|name|contact)$/, 'full_name'],
  [/^(businessname|business|company)$/, 'company'],
  [/^(phone|phonenumber|number)$/, 'phone'],
  [/^(email|emailaddress)$/, 'email'],
  [/^(industry|niche)$/, 'industry'],
  [/^(website|websiteurl|site|url|domain)$/, 'website'],
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
      // Keep each record's spreadsheet row number (header = row 1) so a
      // server error can point at the row the setter will actually see.
      const grid = parseCsv(text)
        .map((cells, i) => ({ cells, sheetRow: i + 1 }))
        .filter((r) => r.cells.some((c) => c.trim()));
      if (grid.length < 2) {
        toast.error('Empty file', 'No rows found under the header.');
        return;
      }
      const fieldByCol = mapHeaders(grid[0].cells);
      if (!fieldByCol.includes('full_name')) {
        toast.error(
          'No name column',
          'Add a "Contact Name" (or "Name") column and try again.',
        );
        return;
      }
      const records = grid.slice(1).map(({ cells, sheetRow }) => {
        const rec: Record<string, string> = {};
        fieldByCol.forEach((field, i) => {
          if (field && cells[i]?.trim()) rec[field] = cells[i].trim();
        });
        return { rec, sheetRow };
      }).filter((r) => r.rec.full_name);
      const rows = records.map((r) => r.rec);

      if (rows.length === 0) {
        toast.error('Nothing to import', 'No rows had a contact name.');
        return;
      }
      if (rows.length > MAX_IMPORT_ROWS) {
        toast.error(
          'File too large',
          `${rows.length.toLocaleString()} prospects — import up to ${MAX_IMPORT_ROWS.toLocaleString()} at a time. Split the file and try again.`,
        );
        return;
      }

      const res = await fetch('/api/outreach/prospects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server names the failing row by its index in `rows`; translate
        // that to the spreadsheet row number.
        const sheetRow =
          typeof body.row === 'number' ? records[body.row]?.sheetRow : undefined;
        toast.error(
          "Couldn't import",
          sheetRow && body.message
            ? `Row ${sheetRow}: ${body.message}. Nothing was imported.`
            : (body.error ?? 'Try again.'),
        );
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
