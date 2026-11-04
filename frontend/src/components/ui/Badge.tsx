import React from 'react';
import { clsx } from 'clsx';
import { CallState, InterestStatus, ProviderType, CampaignStatus } from '../../types/api';

export interface BadgeProps {
  children?: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'amber';
  size?: 'xs' | 'sm' | 'md';
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
  dot = false,
  pulse = false,
  className,
}) => {
  const sizeClasses = {
    xs: 'px-2.5 py-0.5 text-[12px] font-semibold rounded-full gap-1.5',
    sm: 'px-3 py-1 text-[12.5px] font-semibold rounded-full gap-1.5',
    md: 'px-3.5 py-1.5 text-[13px] font-semibold rounded-full gap-2',
  };

  // Strictly compliant token styles: green for success, red for danger, orange for warning/busy, neutral glass for default
  const variantClasses = {
    default:
      'bg-slate-100 text-slate-800 dark:bg-white/[0.08] dark:text-[#F8F8FA] border border-slate-200 dark:border-white/[0.12]',
    success:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30',
    warning:
      'bg-orange-50 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300 border border-orange-200 dark:border-orange-500/35',
    danger:
      'bg-rose-50 text-rose-800 dark:bg-red-500/15 dark:text-red-300 border border-rose-200 dark:border-red-500/30',
    // Mapped aliases ensuring zero off-palette colors leak through
    info:
      'bg-slate-100 text-slate-800 dark:bg-white/[0.08] dark:text-[#F8F8FA] border border-slate-200 dark:border-white/[0.12]',
    amber:
      'bg-orange-50 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300 border border-orange-200 dark:border-orange-500/35',
  };

  const dotClasses = {
    default: 'bg-slate-400 dark:bg-zinc-400',
    success: 'bg-emerald-500',
    warning: 'bg-orange-500',
    danger: 'bg-red-500',
    info: 'bg-zinc-400',
    amber: 'bg-orange-500',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center select-none shrink-0 tabular-nums',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    >
      {dot && (
        <span
          className={clsx(
            'w-1.5 h-1.5 rounded-full shrink-0',
            dotClasses[variant],
            pulse && 'animate-ping'
          )}
        />
      )}
      {children}
    </span>
  );
};

// Specialized Call State Badge matching all backend states
export const CallStateBadge: React.FC<{ state: CallState; size?: 'xs' | 'sm' | 'md' }> = ({ state, size = 'sm' }) => {
  switch (state) {
    case 'QUEUED':
      return <Badge variant="default" size={size} dot>{state}</Badge>;
    case 'DIALING':
    case 'RINGING':
    case 'THINKING':
    case 'SPEAKING':
      return <Badge variant="warning" size={size} dot pulse>{state}</Badge>;
    case 'CONNECTED':
    case 'LISTENING':
      return <Badge variant="success" size={size} dot pulse>{state}</Badge>;
    case 'COMPLETED':
      return <Badge variant="success" size={size} dot>{state}</Badge>;
    case 'FAILED':
    case 'HANGUP':
      return <Badge variant="danger" size={size} dot>{state}</Badge>;
    case 'BUSY':
    case 'NO_ANSWER':
      return <Badge variant="warning" size={size} dot>{state}</Badge>;
    default:
      return <Badge variant="default" size={size}>{state}</Badge>;
  }
};

// Specialized Interest Badge
export const InterestBadge: React.FC<{ status?: InterestStatus | string | null; size?: 'xs' | 'sm' | 'md' }> = ({
  status,
  size = 'sm',
}) => {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'interested':
    case 'callback_requested':
    case 'qualified':
    case 'hot':
      return <Badge variant="success" size={size} dot>Interested</Badge>;
    case 'not_interested':
    case 'rejected':
    case 'opt_out':
    case 'disqualified':
      return <Badge variant="danger" size={size} dot>Not Interested</Badge>;
    case 'uncertain':
      return <Badge variant="warning" size={size} dot>Uncertain</Badge>;
    case 'processing':
    case 'analyzing':
      return <Badge variant="default" size={size} dot pulse>Analyzing</Badge>;
    case 'pending':
    case 'queued':
      return <Badge variant="default" size={size}>Pending</Badge>;
    case 'failed':
      return <Badge variant="danger" size={size}>Failed</Badge>;
    default:
      return <Badge variant="default" size={size}>Unanalyzed</Badge>;
  }
};

// Provider Badge
export const ProviderBadge: React.FC<{ provider?: ProviderType | string | null; size?: 'xs' | 'sm' }> = ({
  provider,
  size = 'xs',
}) => {
  const p = String(provider || '').toLowerCase();
  if (p === 'vobiz') {
    return <Badge variant="default" size={size}>VoBiz</Badge>;
  }
  if (p === 'twilio') {
    return <Badge variant="danger" size={size} className="bg-red-500/10 text-red-500 border-red-500/20 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/40">Twilio</Badge>;
  }
  if (p === 'plivo') {
    return <Badge variant="default" size={size}>Plivo</Badge>;
  }
  if (!p || p === 'mock' || p === 'none') {
    return <Badge variant="default" size={size}>Direct</Badge>;
  }
  return <Badge variant="default" size={size}>{provider}</Badge>;
};

// Campaign Status Badge
export const CampaignStatusBadge: React.FC<{ status: CampaignStatus; size?: 'xs' | 'sm' }> = ({ status, size = 'xs' }) => {
  switch (status) {
    case 'RUNNING':
      return <Badge variant="success" size={size} dot pulse>Running</Badge>;
    case 'PAUSED':
      return <Badge variant="warning" size={size} dot>Paused</Badge>;
    case 'COMPLETED':
      return <Badge variant="success" size={size} dot>Completed</Badge>;
    case 'FAILED':
      return <Badge variant="danger" size={size} dot>Failed</Badge>;
    case 'STOPPED':
      return <Badge variant="default" size={size}>Stopped</Badge>;
    default:
      return <Badge variant="default" size={size}>Created</Badge>;
  }
};
