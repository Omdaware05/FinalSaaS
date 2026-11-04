import React from 'react';
import { Button } from './Button';
import { TimeFilterRange } from '../../utils/excelExport';
import { FileSpreadsheet, Calendar } from 'lucide-react';

export interface TimeFilterAndExportProps {
  timeRange: TimeFilterRange;
  onTimeRangeChange: (range: TimeFilterRange) => void;
  onExport: () => void;
  filteredCount?: number;
  label?: string;
}

export const TimeFilterAndExport: React.FC<TimeFilterAndExportProps> = ({
  timeRange,
  onTimeRangeChange,
  onExport,
  filteredCount,
  label = 'Export Excel',
}) => {
  const options: { id: TimeFilterRange; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'day', label: 'Day' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Time Filter Pill Buttons */}
      <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-white/[0.04] rounded-xl border border-slate-200/70 dark:border-white/[0.08] shadow-xs">
        <div className="flex items-center px-1.5 text-slate-400 dark:text-neutral-500">
          <Calendar className="w-3.5 h-3.5" />
        </div>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onTimeRangeChange(opt.id)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
              timeRange === opt.id
                ? 'bg-orange-500/15 text-orange-400 shadow-xs'
                : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Export to Excel Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onExport}
        className="border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-semibold"
        leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
      >
        {label}
        {filteredCount !== undefined && (
          <span className="ml-1.5 px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-900/60 text-[10px] font-mono font-bold text-emerald-800 dark:text-emerald-300">
            {filteredCount}
          </span>
        )}
      </Button>
    </div>
  );
};
