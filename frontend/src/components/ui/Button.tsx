import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      leftIcon,
      rightIcon,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      xs: 'h-7 px-2.5 text-xs font-medium gap-1.5 rounded-lg',
      sm: 'h-8 px-3 text-xs font-medium gap-1.5 rounded-lg',
      md: 'h-9 px-4 text-sm font-medium gap-2 rounded-xl',
      lg: 'h-11 px-5 text-base font-semibold gap-2.5 rounded-xl',
    };

    const variantClasses = {
      primary:
        'bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white shadow-sm hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] focus-visible:ring-2 focus-visible:ring-orange-500 border border-orange-400/30',
      secondary:
        'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 dark:bg-white/[0.05] dark:hover:bg-white/[0.09] dark:hover:border-orange-500/30 text-slate-800 dark:text-zinc-100 border border-slate-200/80 dark:border-white/[0.08] backdrop-blur-md',
      outline:
        'bg-transparent hover:bg-slate-100 dark:hover:bg-orange-500/[0.08] dark:hover:border-orange-500/40 text-slate-700 dark:text-zinc-200 border border-slate-300 dark:border-white/[0.09] focus-visible:ring-2 focus-visible:ring-orange-500/50',
      ghost:
        'bg-transparent hover:bg-slate-100 dark:hover:bg-orange-500/[0.08] text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 border border-transparent',
      danger:
        'bg-red-500 hover:bg-red-600 active:bg-red-700 text-white shadow-sm focus-visible:ring-2 focus-visible:ring-red-500 border border-transparent',
      success:
        'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm focus-visible:ring-2 focus-visible:ring-emerald-500 border border-transparent',
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={twMerge(
          clsx(
            'app-btn inline-flex items-center justify-center transition-all duration-150 focus-visible:outline-none select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98]', `app-btn-${variant}`,
            sizeClasses[size],
            variantClasses[variant],
            className
          )
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
