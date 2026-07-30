'use client';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/ui/status-pill';
import { formatDate } from '@/lib/formatters';
import { STATUS_LABEL, STATUS_TONE, type ProspectStatus } from '@/lib/outreach/meta';

type Match = {
  kind: 'prospect' | 'contact';
  fullName: string;
  company: string | null;
  phone: string | null;
  status: ProspectStatus | null;
  attempts: number;
  lastContactedAt: string | null;
  ownerName: string | null;
  mine: boolean;
};

const MIN_CHARS = 3;

/**
 * "Already called?" — check a number or business against every setter's list
 * before dialing, so two setters don't work the same lead. Shows who holds it
 * and how far along they are; the notes and pitch angle stay private to the
 * setter who owns the record.
 */
export function ProspectLookup() {
  const [q, setQ] = useState('');
  // Results are tagged with the query they answer, so a stale response is
  // simply ignored at render rather than cleared with an extra setState.
  const [result, setResult] = useState<{ q: string; matches: Match[] } | null>(null);
  const seq = useRef(0);

  const query = q.trim();
  const active = query.length >= MIN_CHARS;
  const matches = result && result.q === query ? result.matches : null;

  useEffect(() => {
    const search = q.trim();
    if (search.length < MIN_CHARS) return;
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      let found: Match[] = [];
      try {
        const res = await fetch(
          `/api/outreach/prospects/lookup?q=${encodeURIComponent(search)}`,
        );
        const body = await res.json().catch(() => ({}));
        if (res.ok) found = (body.matches ?? []) as Match[];
      } catch {
        /* treat as no result — the setter can retype */
      }
      if (seq.current === mine) setResult({ q: search, matches: found });
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="space-y-1.5">
        <label
          htmlFor="prospect_lookup"
          className="font-mono text-[10px] font-medium uppercase tracking-meta text-ink-subtle"
        >
          Already called?
        </label>
        <Input
          id="prospect_lookup"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Phone, business, or email…"
          autoComplete="off"
        />
        <p className="font-sans text-xs text-ink-subtle">
          Checks every setter&apos;s list before you dial.
        </p>
      </div>

      {active ? (
        <div aria-live="polite" className="mt-3">
          {matches === null ? (
            <p className="font-sans text-xs text-ink-subtle">Checking…</p>
          ) : matches.length === 0 ? (
            <p className="font-sans text-xs text-success">
              Not on anyone&apos;s list — clear to call.
            </p>
          ) : (
            <ul className="space-y-2">
              {matches.map((m, i) => (
                <li
                  key={`${m.kind}-${i}`}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-surface-2 px-3 py-2"
                >
                  <span className="text-sm font-medium text-ink">
                    {m.company || m.fullName}
                  </span>
                  {m.phone ? (
                    <span className="font-mono text-xs text-ink-subtle">{m.phone}</span>
                  ) : null}
                  {m.kind === 'contact' ? (
                    <StatusPill label="In pipeline" tone="bg-success/15 text-success" size="sm" />
                  ) : m.status ? (
                    <StatusPill
                      label={STATUS_LABEL[m.status]}
                      tone={STATUS_TONE[m.status]}
                      size="sm"
                    />
                  ) : null}
                  <span className="ml-auto font-sans text-xs text-ink-muted">
                    {m.kind === 'contact'
                      ? 'already a lead'
                      : m.mine
                        ? 'yours'
                        : m.ownerName ?? 'another setter'}
                    {m.lastContactedAt
                      ? ` · last called ${formatDate(m.lastContactedAt)}`
                      : m.attempts > 0
                        ? ` · ${m.attempts} attempt${m.attempts === 1 ? '' : 's'}`
                        : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
