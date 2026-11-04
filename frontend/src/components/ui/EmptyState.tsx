import React from 'react';
import { Button } from './Button';
import { Inbox } from 'lucide-react';
import { clsx } from 'clsx';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}) => {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] backdrop-blur-sm',
        className
      )}
    >
      <div className="w-12 h-12 rounded-xl bg-slate-900/[0.04] dark:bg-white/[0.06] text-orange-500 dark:text-orange-400 border border-slate-900/[0.07] dark:border-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex items-center justify-center mb-4">
        {icon || <Inbox className="w-6 h-6" />}
      </div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      {description && (
        <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1 max-w-sm leading-relaxed">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} size="sm" className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
