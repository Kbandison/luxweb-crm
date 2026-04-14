import { cn } from '@/lib/utils';

export function Monogram({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const initials = extractInitials(name);
  const dims = {
    sm: 'h-8 w-8 text-[11px]',
    md: 'h-10 w-10 text-sm',
    lg: 'h-16 w-16 text-xl',
  }[size];
  return (
    <div
      aria-hidden
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-copper/25 via-copper-soft/70 to-gold/35 font-mono font-semibold text-copper ring-1 ring-copper/15',
        dims,
        className,
      )}
    >
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-black/5" />
      <span className="relative">{initials}</span>
    </div>
  );
}

function extractInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
