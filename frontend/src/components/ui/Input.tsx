import React, { InputHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
            {label}
            {props.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-slate-400 dark:text-zinc-500 pointer-events-none flex items-center justify-center">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={twMerge(
              clsx(
                'w-full h-9 px-3 text-sm rounded-xl transition-all duration-150',
                'bg-white/80 dark:bg-[rgba(18,18,20,0.65)] backdrop-blur-md text-slate-900 dark:text-white',
                'border border-slate-300/80 dark:border-white/[0.08] focus:border-orange-500 dark:focus:border-orange-500',
                'placeholder:text-slate-400 dark:placeholder:text-zinc-600',
                'focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:focus:ring-orange-500/30',
                'disabled:bg-slate-100 dark:disabled:bg-zinc-900/50 disabled:opacity-60 disabled:cursor-not-allowed',
                leftIcon && 'pl-9',
                rightIcon && 'pr-9',
                error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500',
                className
              )
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 text-slate-400 dark:text-zinc-500 flex items-center justify-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
        {!error && helperText && <span className="text-xs text-slate-500 dark:text-zinc-400">{helperText}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
