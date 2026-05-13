import { cn } from '@/lib/utils';

export type EmptyStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
};

/**
 * Canonical "no data yet" placeholder. Dashed card, centered copy,
 * optional icon at top and a single action below the description.
 *
 * Don't reach for this for every dashed-border block — only the
 * empty-list pattern. For drag-and-drop zones or in-progress hints,
 * keep the bespoke styling.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center md:p-10',
        className,
      )}
    >
      {icon ? (
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center text-copper md:h-12 md:w-12">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-base font-medium text-ink md:text-lg">
        {title}
      </h3>
      {description ? (
        <p className="mx-auto mt-2 max-w-md font-sans text-sm text-ink-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 inline-flex">{action}</div> : null}
    </div>
  );
}
