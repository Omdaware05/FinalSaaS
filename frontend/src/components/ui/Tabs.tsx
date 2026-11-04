import React from 'react';
import { clsx } from 'clsx';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'pills' | 'segmented' | 'underline';
  size?: 'sm' | 'md';
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'segmented',
  size = 'md',
}) => {
  if (variant === 'segmented') {
    return (
      <div className="inline-flex items-center p-1 bg-slate-100/80 dark:bg-[rgba(18,18,20,0.65)] rounded-xl border border-slate-200/80 dark:border-white/[0.08] backdrop-blur-md">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={clsx(
                'inline-flex items-center gap-2 rounded-lg font-medium transition-all duration-150 select-none',
                size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs sm:text-sm',
                isActive
                  ? 'bg-white dark:bg-white/[0.12] text-slate-900 dark:text-white shadow-xs font-semibold border border-slate-200/50 dark:border-white/[0.12]'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={clsx(
                    'px-1.5 py-0.2 rounded-full text-[10px] font-semibold tabular-nums',
                    isActive
                      ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20'
                      : 'bg-slate-200/80 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 'pills') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={clsx(
                'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150',
                isActive
                  ? 'bg-orange-500 text-white shadow-xs font-semibold'
                  : 'bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-white/[0.09] border border-transparent dark:border-white/[0.06]'
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className={clsx('px-1.5 py-0.2 rounded-full text-[10px]', isActive ? 'bg-orange-600 text-white' : 'bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300')}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6 border-b border-slate-200 dark:border-white/[0.08]">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={clsx(
              'inline-flex items-center gap-2 py-3 text-sm font-medium border-b-2 -mb-px transition-colors duration-150',
              isActive
                ? 'border-orange-500 text-orange-600 dark:text-orange-400 font-semibold'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:border-slate-300 dark:hover:border-zinc-700'
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
