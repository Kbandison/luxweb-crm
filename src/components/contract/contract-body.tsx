import {
  inlineSegments,
  parseBlocks,
  type Block,
} from '@/lib/contracts/markdown';

/**
 * Renders a contract's body_md on screen. The markdown dialect and its
 * parser live in lib/contracts/markdown.ts, shared with the executed PDF.
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
              : 'mt-5 font-mono text-[11px] font-medium uppercase tracking-meta text-ink-muted';
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
                    className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-meta text-ink-muted"
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
 * Inline formatting — supports `**bold**` only (see inlineSegments).
 */
function inline(text: string): React.ReactNode {
  return inlineSegments(text).map((seg, i) =>
    seg.bold ? (
      <strong key={i} className="font-semibold text-ink">
        {seg.text}
      </strong>
    ) : (
      seg.text
    ),
  );
}
