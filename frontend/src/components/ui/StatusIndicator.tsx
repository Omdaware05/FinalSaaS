import React from 'react';
import { clsx } from 'clsx';

export type StatusType = 'active' | 'inactive' | 'pending' | 'success' | 'warning' | 'danger' | 'neutral';

interface StatusIndicatorProps {
  status: StatusType;
  label: string;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, label, className }) => {
  const dotColor = {
    active: 'bg-emerald-500',
    success: 'bg-emerald-500',
    inactive: 'bg-slate-400 dark:bg-zinc-600',
    neutral: 'bg-slate-400 dark:bg-zinc-600',
    pending: 'bg-amber-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
  }[status];

  return (
    <div className={clsx('inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-zinc-300', className)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />
      <span className="font-medium">{label}</span>
    </div>
  );
};
