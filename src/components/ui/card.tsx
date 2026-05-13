import { cn } from '@/lib/utils';

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  padding?: 'sm' | 'md' | 'lg' | 'xl';
  rounded?: 'md' | 'lg' | 'xl';
  tone?: 'default' | 'muted' | 'dashed';
};

const PADDING = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
  xl: 'p-8',
} as const;

const ROUNDED = {
  md: 'rounded-lg',
  lg: 'rounded-xl',
  xl: 'rounded-2xl',
} as const;

const TONE = {
  default: 'border border-border bg-surface',
  muted: 'border border-border bg-surface/60',
  dashed: 'border border-dashed border-border bg-surface/60',
} as const;

export function Card({
  padding = 'md',
  rounded = 'lg',
  tone = 'default',
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(TONE[tone], ROUNDED[rounded], PADDING[padding], className)}
      {...props}
    />
  );
}
