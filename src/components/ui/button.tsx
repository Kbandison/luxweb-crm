import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans text-sm font-medium transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ' +
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-copper text-copper-foreground hover:bg-copper/90 active:bg-copper/95 rounded-md',
        secondary:
          'border border-border bg-surface text-ink hover:border-border-strong hover:bg-surface-2 rounded-md',
        danger:
          'bg-danger text-white hover:bg-danger/90 active:bg-danger/95 rounded-md',
        ghost: 'text-ink hover:bg-surface-2 rounded-md',
        link: 'text-copper underline-offset-4 hover:underline rounded-sm',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-11 px-6',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant, size, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
