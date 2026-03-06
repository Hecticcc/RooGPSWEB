/**
 * PT60-L event code (alm-code) to human-friendly label + severity for View Tracker.
 * Unknown codes shown as "Activity (code XX)".
 */

export type EventSeverity = 'info' | 'warn';

export type EventCodeInfo = {
  label: string;
  severity: EventSeverity;
};

const EVENT_MAP: Record<string, EventCodeInfo> = {
  '0': { label: 'Location update', severity: 'info' },
  '24': { label: 'Movement detected', severity: 'info' },
  '27': { label: 'Wake', severity: 'info' },
  '28': { label: 'Motion detected', severity: 'warn' },
  '31': { label: 'Heartbeat', severity: 'info' },
  '36': { label: 'Stop', severity: 'info' },
  '37': { label: 'Start', severity: 'info' },
  '39': { label: 'Idle', severity: 'info' },
  '40': { label: 'Moving', severity: 'info' },
  '41': { label: 'Motion', severity: 'info' },
};

export function getEventCodeInfo(eventCode: string | number | null): EventCodeInfo {
  if (eventCode == null || eventCode === '') {
    return { label: '—', severity: 'info' };
  }
  const key = String(eventCode);
  const found = EVENT_MAP[key];
  if (found) return found;
  return { label: `Activity (${key})`, severity: 'info' };
}
