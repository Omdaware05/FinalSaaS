import React, { SelectHTMLAttributes, forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: SelectOption[];
  error?: string;
  helperText?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, helperText, children, className, id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
            {label}
            {props.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          <select
            ref={ref}
            id={selectId}
            className={twMerge(
              clsx(
                'w-full h-9 pl-3 pr-8 text-sm rounded-xl appearance-none transition-all duration-150 cursor-pointer',
                'bg-white/80 dark:bg-[rgba(18,18,20,0.65)] backdrop-blur-md text-slate-900 dark:text-white',
                'border border-slate-300/80 dark:border-white/[0.08] focus:border-orange-500 dark:focus:border-orange-500',
                'focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:focus:ring-orange-500/30',
                'disabled:bg-slate-100 dark:disabled:bg-zinc-900/50 disabled:opacity-60 disabled:cursor-not-allowed',
                error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
                className
              )
            )}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-white dark:bg-[#16161a] text-slate-900 dark:text-white">
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-2.5 text-slate-400 dark:text-zinc-500 pointer-events-none" />
        </div>
        {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
        {!error && helperText && <span className="text-xs text-slate-500 dark:text-zinc-400">{helperText}</span>}
      </div>
    );
  }
);

Select.displayName = 'Select';
