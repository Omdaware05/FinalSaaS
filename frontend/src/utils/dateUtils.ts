import { format } from 'date-fns';

/**
 * Robustly parses a backend timestamp into a JavaScript Date.
 * Ensures timestamps sent from SQLite without timezone offsets are treated as UTC,
 * translating accurately to the client's local timezone (e.g. IST UTC+5:30).
 */
export function parseServerDate(val?: string | Date | number | null): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  let s = String(val).trim();
  if (!s) return null;

  // Format: "2026-10-30 11:04:00" -> "2026-10-30T11:04:00"
  if (s.includes(' ') && !s.includes('T')) {
    s = s.replace(' ', 'T');
  }

  // If no timezone offset (Z or +/-HH:MM), treat as UTC
  if (!s.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(s)) {
    s = s + 'Z';
  }

  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Format a server date string using date-fns in the user's local timezone.
 */
export function formatDateTime(
  val?: string | Date | number | null,
  pattern: string = 'MMM dd, yyyy · hh:mm a'
): string {
  const d = parseServerDate(val);
  if (!d) return 'N/A';
  try {
    return format(d, pattern);
  } catch {
    return String(val);
  }
}

/**
 * Format date only: e.g. "Oct 30, 2026"
 */
export function formatDate(
  val?: string | Date | number | null,
  pattern: string = 'MMM dd, yyyy'
): string {
  const d = parseServerDate(val);
  if (!d) return 'N/A';
  try {
    return format(d, pattern);
  } catch {
    return String(val);
  }
}

/**
 * Format time only: e.g. "04:34 PM"
 */
export function formatTime(
  val?: string | Date | number | null,
  pattern: string = 'hh:mm a'
): string {
  const d = parseServerDate(val);
  if (!d) return '';
  try {
    return format(d, pattern);
  } catch {
    return '';
  }
}

/**
 * Format for HTML <input type="datetime-local" /> in the browser's local timezone:
 * "YYYY-MM-DDTHH:mm"
 */
export function toLocalDatetimeInput(val?: string | Date | number | null): string {
  const d = parseServerDate(val);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  return `${y}-${m}-${day}T${hours}:${mins}`;
}

/**
 * Check if a scheduled callback is due based on local clock.
 */
export function isFollowupDue(val?: string | Date | number | null, status?: string): boolean {
  if (status && status !== 'scheduled' && status !== 'pending') {
    return false;
  }
  const d = parseServerDate(val);
  if (!d) return false;
  return d.getTime() <= Date.now();
}

/**
 * Accurate relative time difference from local now.
 */
export function timeAgo(val?: string | Date | number | null): string {
  const d = parseServerDate(val);
  if (!d) return '';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

