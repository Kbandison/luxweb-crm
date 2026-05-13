import { cn } from '@/lib/utils';

export type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('space-y-2', className)}>
      {eyebrow ? (
        <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
          {eyebrow}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-4">
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink md:text-4xl">
          {title}
        </h1>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {description ? (
        <p className="max-w-xl font-sans text-sm text-ink-muted">
          {description}
        </p>
      ) : null}
      <div className="copper-rule mt-5 h-px w-24" />
    </header>
  );
}
