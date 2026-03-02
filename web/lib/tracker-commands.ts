/**
 * Tracker SMS command presets (iStartek-style). Password 0000.
 * Used by API to build command_text from key + optional params.
 */

const PWD = '0000';

export const TRACKER_COMMAND_PRESETS: Record<
  string,
  { name: string; build: (params?: Record<string, string | number>) => string; adminOnly?: boolean }
> = {
  live_location: { name: 'Request Live Location (800)', build: () => `${PWD},800` },
  work_status: { name: 'Request Work Status (802)', build: () => `${PWD},802` },
  check_ip_port: { name: 'Check IP/Port (808,100)', build: () => `${PWD},808,100` },
  check_upload_interval: { name: 'Check Upload Interval (808,102)', build: () => `${PWD},808,102` },
  check_apn: { name: 'Check APN (808,109)', build: () => `${PWD},808,109` },
  set_server: {
    name: 'Set server host+port (100)',
    adminOnly: true,
    build: (p) => `${PWD},100,1,${String(p?.host ?? '').trim()},${Number(p?.port) || 0}`,
  },
  set_upload_interval: {
    name: 'Set upload interval (102)',
    adminOnly: true,
    build: (p) => `${PWD},102,${Math.max(0, Number(p?.seconds) ?? 0)}`,
  },
  set_apn: {
    name: 'Set APN (109)',
    adminOnly: true,
    build: (p) =>
      `${PWD},109,${String(p?.apn ?? '').trim()},${String(p?.user ?? '').trim()},${String(p?.pw ?? '').trim()}`,
  },
};

export function buildCommandText(
  commandKey: string,
  params?: Record<string, string | number>
): { command_name: string; command_text: string } | { error: string } {
  const preset = TRACKER_COMMAND_PRESETS[commandKey];
  if (!preset) return { error: `Unknown command: ${commandKey}` };
  return { command_name: preset.name, command_text: preset.build(params) };
}
