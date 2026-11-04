import React, { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Check, Plus, Layers, Search, ArrowRight } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useBusiness } from '../../app/providers/BusinessProvider';
import { clsx } from 'clsx';

interface BusinessSelectorProps {
  className?: string;
}

export const BusinessSelector: React.FC<BusinessSelectorProps> = ({ className }) => {
  const {
    businesses,
    selectedBusinessId,
    selectedBusiness,
    isAllBusinesses,
    selectBusiness,
  } = useBusiness();

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const filtered = businesses.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.industry.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={clsx('relative inline-block text-left', className)} ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all',
          'bg-slate-100 hover:bg-slate-200/80 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]',
          'border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-neutral-100',
          'focus:outline-none focus:ring-2 focus:ring-orange-500/20'
        )}
      >
        <Building2 className="w-3.5 h-3.5 text-slate-500 dark:text-neutral-400 shrink-0" />
        <span className="truncate max-w-[140px] sm:max-w-[180px] font-semibold">
          {isAllBusinesses ? 'All Businesses' : selectedBusiness?.name || 'Select Business'}
        </span>
        <ChevronDown
          className={clsx(
            'w-3.5 h-3.5 text-slate-400 transition-transform duration-150 shrink-0 ml-0.5',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-72 sm:w-80 rounded-2xl bg-white dark:bg-[#15171e] border border-slate-200/90 dark:border-white/[0.12] shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="p-2.5 border-b border-slate-100 dark:border-white/[0.08] bg-slate-50/50 dark:bg-[#121319]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white dark:bg-[#1a1c24] border border-slate-200 dark:border-white/[0.10] rounded-lg text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                autoFocus
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
            {/* All Businesses (Agency Global) option */}
            <button
              type="button"
              onClick={() => {
                selectBusiness('all');
                setIsOpen(false);
              }}
              className={clsx(
                'w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs text-left transition-colors',
                isAllBusinesses
                  ? 'bg-orange-500/10 font-semibold text-orange-400'
                  : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="truncate font-medium">All Businesses (Agency View)</span>
                  <span className="text-[10px] text-slate-400 dark:text-neutral-500 truncate">Aggregate metrics & all agents</span>
                </div>
              </div>
              {isAllBusinesses && <Check className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
            </button>

            <div className="px-2.5 py-1.5 text-[10px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider">
              Client Accounts ({businesses.length})
            </div>

            {filtered.map((biz) => {
              const isSelected = selectedBusinessId === biz.id;
              return (
                <button
                  key={biz.id}
                  type="button"
                  onClick={() => {
                    selectBusiness(biz.id);
                    setIsOpen(false);
                  }}
                  className={clsx(
                    'w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs text-left transition-colors',
                    isSelected
                      ? 'bg-orange-500/10 font-semibold text-orange-400'
                      : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate font-medium">{biz.name}</span>
                      <span className="text-[10px] text-slate-400 dark:text-neutral-500 truncate">{biz.industry}</span>
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
                </button>
              );
            })}

            {filtered.length === 0 && (
              <div className="p-3 text-center text-xs text-slate-400 dark:text-neutral-500">
                No matching businesses
              </div>
            )}
          </div>

          {/* Footer: Manage Businesses */}
          <div className="p-2 border-t border-slate-100 dark:border-white/[0.08] bg-slate-50 dark:bg-[#121319]">
            <NavLink
              to="/businesses"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <span>Manage all businesses</span>
              <ArrowRight className="w-3 h-3 text-orange-400" />
            </NavLink>
          </div>
        </div>
      )}
    </div>
  );
};
