'use client';

import { BrandMark } from './brand-logo';

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

type AppLoaderProps = {
  label?: string;
  variant?: 'full' | 'inline' | 'overlay';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const markSize = { sm: 28, md: 40, lg: 56 } as const;
const ringSize = { sm: 44, md: 64, lg: 88 } as const;

export function AppLoader({
  label = 'Loading…',
  variant = 'full',
  size = 'md',
  className,
}: AppLoaderProps) {
  const content = (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4',
        variant === 'inline' && 'flex-row gap-3',
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="relative flex items-center justify-center"
        style={{ width: ringSize[size], height: ringSize[size] }}
      >
        <span
          className="absolute inset-0 animate-spin rounded-full border-2 border-teal-100 border-t-brand border-r-accent"
          style={{ animationDuration: '0.85s' }}
          aria-hidden
        />
        <span className="absolute inset-1 animate-loader-pulse rounded-full border border-teal-50/80" aria-hidden />
        <BrandMark size={markSize[size]} className="relative z-[1] animate-loader-breathe shadow-md" />
      </div>
      {label ? (
        <p
          className={cn(
            'text-sm font-medium text-slate-600',
            variant === 'inline' && 'text-slate-500',
            size === 'lg' && 'text-base',
          )}
        >
          {label}
        </p>
      ) : null}
      <span className="sr-only">{label || 'Loading'}</span>
    </div>
  );

  if (variant === 'overlay') {
    return (
      <div className={cn('fixed inset-0 z-[90] flex items-center justify-center bg-slate-50/90 backdrop-blur-[2px]', className)}>
        {content}
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <div className={cn('flex min-h-[12rem] w-full items-center justify-center py-10', className)}>
        {content}
      </div>
    );
  }

  return <div className={className}>{content}</div>;
}
