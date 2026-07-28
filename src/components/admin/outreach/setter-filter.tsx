'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import type { SetterOption } from '@/lib/queries/outreach';

export function OutreachSetterFilter({
  setters,
  current,
}: {
  setters: SetterOption[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function onChange(value: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) sp.set('setter', value);
    else sp.delete('setter');
    startTransition(() => {
      router.push(sp.toString() ? `${pathname}?${sp.toString()}` : pathname);
    });
  }

  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filter by setter"
      className="h-9 rounded-md border border-border bg-surface px-2 font-mono text-[10px] uppercase tracking-meta text-ink-muted hover:border-border-strong focus:border-copper focus:outline-none"
    >
      <option value="">All setters</option>
      {setters.map((s) => (
        <option key={s.userId} value={s.userId}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
