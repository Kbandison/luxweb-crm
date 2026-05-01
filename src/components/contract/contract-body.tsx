/**
 * Renders the contract body_md. Targets the specific markdown features
 * used in src/content/agreement-v1.1.md:
 *
 *   - # / ## / ### / #### headings
 *   - **bold** inline
 *   - unordered lists (lines starting with "- ")
 *   - pipe tables  ( "| col | col |" ... )
 *   - horizontal rules ("---")
 *   - blank-line separated paragraphs
 *
 * Deliberately hand-rolled so the legal content is rendered through code
 * we fully control — no surprise HTML escaping, no dependency churn.
 */
export function ContractBody({ body }: { body: string }) {
  const blocks = parseBlocks(body);
  return (
    <div className="font-sans text-ink">
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}

type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; rows: string[][] }
  | { type: 'hr' };

function parseBlocks(src: string): Block[] {
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

function Block({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading': {
      const headingClass =
        block.level === 1
          ? 'mt-10 font-display text-3xl font-medium tracking-tight text-ink'
          : block.level === 2
            ? 'mt-9 font-display text-xl font-medium tracking-tight text-ink'
            : block.level === 3
              ? 'mt-7 font-display text-base font-medium tracking-tight text-ink'
              : 'mt-5 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-ink-muted';
      switch (block.level) {
        case 1:
          return <h1 className={headingClass}>{inline(block.text)}</h1>;
        case 2:
          return <h2 className={headingClass}>{inline(block.text)}</h2>;
        case 3:
          return <h3 className={headingClass}>{inline(block.text)}</h3>;
        case 4:
          return <h4 className={headingClass}>{inline(block.text)}</h4>;
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'paragraph':
      return (
        <p className="mt-4 text-sm leading-relaxed text-ink">
          {inline(block.text)}
        </p>
      );
    case 'list':
      return (
        <ul className="mt-3 list-disc space-y-1.5 pl-6 text-sm leading-relaxed text-ink">
          {block.items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div className="mt-5 overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-ink/[0.03]">
                {block.rows[0]?.map((cell, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted"
                  >
                    {inline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.slice(1).map((row, r) => (
                <tr key={r} className="border-b border-border last:border-0">
                  {row.map((cell, c) => (
                    <td key={c} className="px-3 py-2 align-top text-ink">
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr className="mt-8 border-border" />;
  }
}

/**
 * Inline formatting — supports `**bold**`. Everything else (links, italics,
 * inline code) is rare in the agreement template and would open up an XSS
 * surface we don't need.
 */
function inline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const re = /\*\*(.+?)\*\*/g;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={key++} className="font-semibold text-ink">
        {match[1]}
      </strong>,
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
