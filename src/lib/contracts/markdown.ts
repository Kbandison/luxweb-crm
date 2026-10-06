/**
 * The small markdown dialect the Agreement templates use, parsed once and
 * shared by the on-screen contract (ContractBody) and the executed PDF —
 * so the two can't disagree about what the contract says.
 *
 *   - # / ## / ### / #### headings
 *   - **bold** inline
 *   - unordered lists (lines starting with "- ")
 *   - pipe tables  ( "| col | col |" ... )
 *   - horizontal rules ("---")
 *   - blank-line separated paragraphs
 *
 * Deliberately hand-rolled so the legal content is rendered through code
 * we fully control — no surprise HTML, no dependency churn.
 */

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; rows: string[][] }
  | { type: 'hr' };

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    if (/^---\s*$/.test(line)) {
      out.push({ type: 'hr' });
      i++;
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      out.push({
        type: 'heading',
        level: h[1].length as 1 | 2 | 3 | 4,
        text: h[2].trim(),
      });
      i++;
      continue;
    }

    if (/^\s*\|.+\|\s*$/.test(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines
        .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
        // Drop the alignment row ( | --- | --- | ).
        .filter((cells) => !cells.every((c) => /^-+:?$|^:?-+$|^:?-+:?$/.test(c)));
      out.push({ type: 'table', rows });
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, '').trim());
        i++;
      }
      out.push({ type: 'list', items });
      continue;
    }

    // Paragraph — consume until blank line or block boundary.
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|---\s*$|\s*\|.+\|\s*$|\s*-\s+)/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    out.push({ type: 'paragraph', text: paraLines.join(' ').trim() });
  }

  return out;
}

/**
 * Split a line into plain and **bold** runs. Bold is the only inline
 * formatting — links, italics and inline code are rare in the template and
 * would open up an XSS surface we don't need.
 */
export function inlineSegments(text: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    out.push({ text: match[1], bold: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) out.push({ text: text.slice(lastIndex), bold: false });
  return out;
}
