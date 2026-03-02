/**
 * Whether current local time is within [start, end).
 * start/end are "HH:mm" (e.g. "21:00", "06:00").
 * If start <= end: window is same day (e.g. 09:00–17:00).
 * If start > end: overnight (e.g. 21:00–06:00 = 21:00 to next day 06:00).
 */
export function isWithinWindow(
  nowLocalMinutes: number,
  startMinutes: number,
  endMinutes: number
): boolean {
  if (startMinutes <= endMinutes) {
    return nowLocalMinutes >= startMinutes && nowLocalMinutes < endMinutes;
  }
  return nowLocalMinutes >= startMinutes || nowLocalMinutes < endMinutes;
}

/** Parse "HH:mm" to minutes since midnight (0–1439). */
export function parseTimeLocal(s: string): number {
  const parts = s.trim().split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '0', 10);
  return Math.max(0, Math.min(1439, h * 60 + m));
}
