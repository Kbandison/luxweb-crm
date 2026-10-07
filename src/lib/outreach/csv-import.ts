/** Most prospects one CSV import may carry — enforced client- and server-side. */
export const MAX_IMPORT_ROWS = 2000;

/**
 * Minimal RFC 4180 CSV parser (quotes, escaped "", commas and newlines inside
 * quoted fields). Returns one array per record, header included, so record
 * index + 1 is the row number a spreadsheet shows.
 *
 * A quote only opens a quoted field at the very start of a field. A stray one
 * mid-field (`5" screen`) is literal — treating it as an opener used to flip
 * quote mode and swallow every row up to the next quote.
 */
export function parseCsv(text: string): string[][] {
  // Excel's UTF-8 export leads with a BOM; left in, it would sit before a
  // quoted first header and stop that quote from opening the field.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let atFieldStart = true;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
    } else if (c === ',') {
      row.push(field);
      field = '';
      atFieldStart = true;
    } else if (c === '\r') {
      /* ignore */
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      atFieldStart = true;
    } else {
      field += c;
      atFieldStart = false;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
