import React from 'react';
import { clsx } from 'clsx';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'rectangular',
  width,
  height,
  style,
  ...props
}) => {
  const variantClasses = {
    text: 'rounded-md h-4 w-full',
    rectangular: 'rounded-xl',
    circular: 'rounded-full',
  };

  return (
    <div
      className={clsx(
        'skeleton-shimmer bg-slate-200/80 dark:bg-slate-800/80',
        variantClasses[variant],
        className
      )}
      style={{
        width,
        height,
        ...style,
      }}
      {...props}
    />
  );
};

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 5 }) => (
  <div className="w-full space-y-3">
    <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} height={20} className="flex-1" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex gap-4 py-3 border-b border-slate-100 dark:border-slate-800/50 items-center">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} height={16} className="flex-1" />
        ))}
      </div>
    ))}
  </div>
);
