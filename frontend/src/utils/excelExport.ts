import * as XLSX from 'xlsx';
import { isAfter, subDays, startOfDay } from 'date-fns';
import { parseServerDate } from './dateUtils';

export type TimeFilterRange = 'all' | 'day' | 'week' | 'month';

/**
 * Filter an array of items by a date field using the chosen time filter range.
 * - 'day': items from the start of today (or last 24h)
 * - 'week': items within the last 7 days
 * - 'month': items within the last 30 days
 * - 'all': all items without date restriction
 */
export function filterByDateRange<T>(
  items: T[],
  getDateStr: (item: T) => string | Date | null | undefined,
  range: TimeFilterRange
): T[] {
  if (range === 'all') return items;

  const now = new Date();
  let thresholdDate: Date;

  if (range === 'day') {
    thresholdDate = startOfDay(now);
  } else if (range === 'week') {
    thresholdDate = subDays(now, 7);
  } else if (range === 'month') {
    thresholdDate = subDays(now, 30);
  } else {
    return items;
  }

  return items.filter((item) => {
    const raw = getDateStr(item);
    if (!raw) return false;
    try {
      const dt = parseServerDate(raw);
      if (!dt || isNaN(dt.getTime())) return false;
      return isAfter(dt, thresholdDate) || dt.getTime() === thresholdDate.getTime();
    } catch {
      return false;
    }
  });
}

/**
 * Exports JSON data rows directly to an Excel (.xlsx) spreadsheet with auto-fitted column widths.
 */
export function exportToExcel(
  data: Record<string, any>[],
  fileName: string,
  sheetName: string = 'Data'
): void {
  if (!data || data.length === 0) {
    alert('No data available to export for the selected filter.');
    return;
  }

  const ws = XLSX.utils.json_to_sheet(data);

  // Auto-calculate column widths
  if (data.length > 0) {
    const keys = Object.keys(data[0]);
    const colWidths = keys.map((key) => {
      let maxLen = key.length;
      data.forEach((row) => {
        const val = row[key];
        if (val !== null && val !== undefined) {
          const str = String(val);
          if (str.length > maxLen) {
            maxLen = Math.min(str.length, 50); // cap max width at 50
          }
        }
      });
      return { wch: Math.max(maxLen + 3, 12) };
    });
    ws['!cols'] = colWidths;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const cleanName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(wb, cleanName);
}
