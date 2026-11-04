import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, Search } from 'lucide-react';
import { TableSkeleton } from './Skeleton';
import { EmptyState } from './EmptyState';
import { Input } from './Input';
import { ParticleStars } from '../effects/ParticleStars';
import { clsx } from 'clsx';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  searchPlaceholder?: string;
  searchableKey?: keyof T | ((item: T) => string);
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
  rightToolbar?: React.ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  keyExtractor,
  onRowClick,
  searchPlaceholder = 'Search records...',
  searchableKey,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no records matching your current filter criteria.',
  pageSize = 10,
  rightToolbar,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isTableHovered, setIsTableHovered] = useState(false);

  const safeData = Array.isArray(data) ? data : [];

  // Filter
  const filteredData = React.useMemo(() => {
    if (!searchQuery.trim() || !searchableKey) return safeData;
    return safeData.filter((item) => {
      let val = '';
      if (typeof searchableKey === 'function') {
        val = searchableKey(item);
      } else {
        val = String((item as any)[searchableKey] || '');
      }
      return val.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [safeData, searchQuery, searchableKey]);

  // Sort
  const sortedData = React.useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a: any, b: any) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      return sortOrder === 'asc' ? 1 : -1;
    });
  }, [filteredData, sortKey, sortOrder]);

  // Pagination
  const totalPages = Math.ceil((Array.isArray(sortedData) ? sortedData.length : 0) / pageSize) || 1;
  const paginatedData = Array.isArray(sortedData)
    ? sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : [];

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortOrder === 'asc') setSortOrder('desc');
      else {
        setSortKey(null);
        setSortOrder('asc');
      }
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Table Toolbar */}
      {(searchableKey || rightToolbar) && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {searchableKey ? (
            <div className="w-full sm:max-w-xs">
              <Input
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
          ) : (
            <div />
          )}
          {rightToolbar && <div className="flex items-center gap-2 self-end">{rightToolbar}</div>}
        </div>
      )}

      {/* Table Container */}
      <div
        data-glow=""
        onMouseEnter={() => setIsTableHovered(true)}
        onMouseLeave={() => setIsTableHovered(false)}
        className="relative rounded-2xl border border-slate-200/80 dark:border-white/[0.09] bg-white/75 dark:bg-[var(--card-glass-bg)] backdrop-blur-[18px] shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.35)] overflow-hidden glow-card"
      >
        <ParticleStars isHovered={isTableHovered} particleCount={25} />
        <div className="relative z-[1] overflow-x-auto">
          <table className="app-table w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02] text-[12px] font-semibold text-slate-600 dark:text-[#C9C9D1] uppercase tracking-wider">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    style={{ width: col.width }}
                    className={clsx(
                      'px-4 py-3.5 select-none',
                      col.sortable && 'cursor-pointer hover:text-slate-900 dark:hover:text-white',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center'
                    )}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div
                      className={clsx(
                        'inline-flex items-center gap-1.5',
                        col.align === 'right' && 'justify-end w-full',
                        col.align === 'center' && 'justify-center w-full'
                      )}
                    >
                      <span>{col.header}</span>
                      {col.sortable && <ArrowUpDown className="w-3.5 h-3.5 stroke-[1.75] text-slate-400 dark:text-[#9D9DA8]" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06] text-[13.5px] font-medium text-slate-800 dark:text-[#F8F8FA]">
              {isLoading && safeData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="p-6">
                    <TableSkeleton rows={pageSize} cols={columns.length} />
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="p-8">
                    <EmptyState title={emptyTitle} description={emptyDescription} />
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, rowIdx) => {
                  const key = keyExtractor(item);
                  return (
                    <tr
                      key={key}
                      onClick={() => onRowClick && onRowClick(item)}
                      style={{ animationDelay: `${Math.min(rowIdx * 45, 360)}ms` }}
                      className={clsx(
                        'anim-row transition-colors duration-150',
                        'hover:bg-slate-50/80 dark:hover:bg-[rgba(var(--primary-rgb),0.08)]',
                        onRowClick && 'cursor-pointer'
                      )}
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={clsx(
                            'px-4 py-3.5 font-normal align-middle',
                            col.align === 'right' && 'text-right',
                            col.align === 'center' && 'text-center'
                          )}
                        >
                          {col.render ? col.render(item) : (item as any)[col.key]}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Bar */}
      {!isLoading && sortedData.length > pageSize && (
        <div className="flex items-center justify-between px-2 py-1 text-xs text-slate-500 dark:text-zinc-400">
          <span>
            Showing <strong className="text-slate-800 dark:text-zinc-200">{(currentPage - 1) * pageSize + 1}</strong> to{' '}
            <strong className="text-slate-800 dark:text-zinc-200">
              {Math.min(currentPage * pageSize, sortedData.length)}
            </strong>{' '}
            of <strong className="text-slate-800 dark:text-zinc-200">{sortedData.length}</strong> entries
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
