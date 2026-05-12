'use client';
import * as React from 'react';
import { Input, type InputProps } from './input';
import { cn } from '@/lib/utils';

/**
 * Single-line password/secret input with show/hide toggle. Use for
 * passwords, API keys, SFTP passwords — anywhere the value is masked
 * by default but the user may want to peek before submitting.
 */
export const SecretInput = React.forwardRef<HTMLInputElement, InputProps>(
  function SecretInput({ className, type: _ignored, ...props }, ref) {
    const [show, setShow] = React.useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={show ? 'text' : 'password'}
          className={cn('pr-12 font-mono', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide secret' : 'Show secret'}
          aria-pressed={show}
          className="absolute right-1.5 top-1/2 inline-flex h-7 -translate-y-1/2 items-center rounded-md px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/40"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    );
  },
);
