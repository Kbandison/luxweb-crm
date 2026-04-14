import { cn } from '@/lib/utils';

export function TagPill({
  children,
  size = 'sm',
  className,
}: {
  children: React.ReactNode;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-copper-soft/55 font-sans font-medium text-copper',
        size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs',
        className,
      )}
    >
      {children}
    </span>
  );
}
