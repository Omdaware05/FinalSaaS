import React from 'react';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  category?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  category,
  actions,
}) => {
  return (
    <div className="app-pageheader flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-white/[0.07]">
      <div className="flex flex-col gap-0.5 anim-enter">
        {category && (
          <span className="text-[11px] font-semibold text-orange-400 uppercase tracking-[0.14em]">
            {category}
          </span>
        )}
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs sm:text-[13px] text-slate-500 dark:text-neutral-400 max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap shrink-0 anim-enter" style={{ animationDelay: '90ms' }}>
          {actions}
        </div>
      )}
    </div>
  );
};
