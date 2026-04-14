import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink',
          'font-sans placeholder:text-ink-subtle',
          'focus-visible:outline-none focus-visible:border-copper focus-visible:ring-2 focus-visible:ring-copper/30',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/30',
          className,
        )}
        {...props}
      />
    );
  },
);
