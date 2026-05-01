'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function StarInput({
  value,
  onChange,
  disabled,
  size = 'md',
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;
  const px = size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-9 w-9' : 'h-7 w-7';

  return (
    <div
      role="radiogroup"
      aria-label="Rating"
      className="inline-flex items-center gap-1"
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= display;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            disabled={disabled}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
            className={cn(
              'transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-copper rounded',
              disabled && 'cursor-default hover:scale-100',
            )}
          >
            <svg
              viewBox="0 0 24 24"
              fill={filled ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(
                px,
                filled ? 'text-copper' : 'text-ink-subtle',
                'drop-shadow-sm',
              )}
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

export function StarDisplay({
  value,
  size = 'md',
}: {
  value: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const px = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-7 w-7' : 'h-5 w-5';
  return (
    <div className="inline-flex items-center gap-0.5" aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <svg
            key={n}
            viewBox="0 0 24 24"
            fill={filled ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={cn(px, filled ? 'text-copper' : 'text-ink-subtle')}
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        );
      })}
    </div>
  );
}
