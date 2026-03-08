/**
 * Device model capabilities: battery-first vs wired tracker.
 * Used to decide UI (battery vs external power + backup battery + ACC) and behaviour.
 * Add new models here; keep naming consistent with backend and frontend.
 *
 * Wired-specific alerts (e.g. external power lost, running on backup) can be added later
 * by checking isWired and wired power fields from getWiredPowerFromExtra() in alert pipelines.
 */

export type DeviceCapabilities = {
  /** Model code used for capability lookup (e.g. RG-WF1, RG-B1). */
  modelCode: string | null;
  /** True if device is wired (vehicle power, ACC); false = battery-first. */
  isWired: boolean;
  /** True if device has a backup battery (e.g. wired tracker with internal backup). */
  hasBackupBattery: boolean;
  /** True if device reports ACC/ignition status. */
  hasAcc: boolean;
  /** If false, primary power display is external/wired; battery is "Backup Battery". */
  showPrimaryBatteryAsMain: boolean;
  /** True if UI should show external power status. */
  showExternalPower: boolean;
};

/** Known model codes / display names that map to wired capability set. */
const WIRED_MODEL_KEYS = ['RG-WF1', 'Wired'] as const;

/** Model codes that should appear in admin device model dropdown (in addition to product_pricing). */
export const ADMIN_DEVICE_MODEL_CODES = ['RG-WF1', 'RG-B1'] as const;

/** Known model codes for battery-first trackers (explicit; others default to battery). */
const BATTERY_MODEL_KEYS = ['RG-B1', 'Standard'] as const;

/** Li-ion 1S voltage -> approximate percent for backup battery when packet didn't provide percent. */
function voltageToBackupPercent(v: number): number {
  const clamp = (x: number) => Math.max(3.0, Math.min(4.25, x));
  const c = clamp(v);
  if (c >= 4.2) return 100;
  if (c <= 3.2) return 0;
  const curve: [number, number][] = [[4.2, 100], [4.1, 90], [4.0, 80], [3.9, 70], [3.8, 60], [3.7, 50], [3.4, 20], [3.2, 0]];
  for (let i = 0; i < curve.length - 1; i++) {
    const [v1, p1] = curve[i];
    const [v2, p2] = curve[i + 1];
    if (c <= v1 && c >= v2) {
      const t = (v1 - c) / (v1 - v2);
      return Math.round(p1 + t * (p2 - p1));
    }
  }
  return 0;
}

function normalizeModelKey(nameOrCode: string | null | undefined): string | null {
  if (nameOrCode == null || typeof nameOrCode !== 'string') return null;
  const t = nameOrCode.trim();
  return t === '' ? null : t;
}

/**
 * Resolve capabilities from device model name or code.
 * model_name from DB can be a display name (e.g. "Wired") or code (e.g. "RG-WF1").
 */
export function getDeviceCapabilities(modelNameOrCode: string | null | undefined): DeviceCapabilities {
  const key = normalizeModelKey(modelNameOrCode);
  if (!key) {
    return {
      modelCode: null,
      isWired: false,
      hasBackupBattery: false,
      hasAcc: false,
      showPrimaryBatteryAsMain: true,
      showExternalPower: false,
    };
  }
  const keyLower = key.toLowerCase();
  const isWired =
    WIRED_MODEL_KEYS.some((k) => key === k || keyLower === k.toLowerCase()) ||
    keyLower.includes('wired');
  if (isWired) {
    return {
      modelCode: key,
      isWired: true,
      hasBackupBattery: true,
      hasAcc: true,
      showPrimaryBatteryAsMain: false,
      showExternalPower: true,
    };
  }
  return {
    modelCode: key,
    isWired: false,
    hasBackupBattery: false,
    hasAcc: false,
    showPrimaryBatteryAsMain: true,
    showExternalPower: false,
  };
}

/** Normalized power/wired fields from location extra (packet-derived). */
export type WiredPowerFromExtra = {
  external_power_connected: boolean | null;
  acc_status: 'on' | 'off' | null;
  backup_battery_percent: number | null;
  backup_battery_voltage_v: number | null;
  power_source: 'external' | 'backup' | null;
};

/**
 * Extract normalized wired/power fields from location extra.
 * Use this in APIs so UI gets a single consistent shape; parser writes raw into extra.
 */
export function getWiredPowerFromExtra(extra: Record<string, unknown> | null | undefined): WiredPowerFromExtra {
  const out: WiredPowerFromExtra = {
    external_power_connected: null,
    acc_status: null,
    backup_battery_percent: null,
    backup_battery_voltage_v: null,
    power_source: null,
  };
  if (!extra) return out;

  const pt60 = extra.pt60_state as { ext_power_connected?: boolean } | undefined;
  const wired = extra.wired_power as {
    external_power_connected?: boolean | null;
    acc_status?: 'on' | 'off' | null;
    backup_battery_percent?: number | null;
    backup_battery_voltage_v?: number | null;
  } | undefined;
  const power = extra.power as { ext_voltage_v?: number; battery_voltage_v?: number } | undefined;
  const battery = extra.battery as { percent?: number; voltage_v?: number } | undefined;

  const extConnected = pt60?.ext_power_connected ?? wired?.external_power_connected ?? null;
  const extV = power?.ext_voltage_v ?? null;
  const extFromVoltage = extV != null && extV > 5;
  out.external_power_connected =
    extConnected === true || extConnected === false ? extConnected : extFromVoltage ? true : null;

  out.acc_status = wired?.acc_status ?? null;

  const backupV = wired?.backup_battery_voltage_v ?? power?.battery_voltage_v ?? battery?.voltage_v ?? null;
  let backupPct = wired?.backup_battery_percent ?? battery?.percent ?? null;
  if (backupPct == null && backupV != null) {
    backupPct = voltageToBackupPercent(backupV);
  }
  out.backup_battery_percent = backupPct != null ? Math.max(0, Math.min(100, Math.round(backupPct))) : null;
  out.backup_battery_voltage_v = backupV ?? null;

  if (out.external_power_connected === true) out.power_source = 'external';
  else if (out.external_power_connected === false && (backupV != null || backupPct != null)) out.power_source = 'backup';
  else if (out.external_power_connected !== null) out.power_source = out.external_power_connected ? 'external' : 'backup';

  return out;
}
