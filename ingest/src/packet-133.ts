/**
 * Dedicated decoder for iStartek/VT-style packet type 133 (RG-WF1 and similar).
 * Prefixes: &&:133, &&A133, &&B133, &&C133 — normalized to packetType "133" and packetPriority.
 * Decoding is isolated here so bit mappings and formulas can be adjusted after real-device validation.
 *
 * CONFIRMED: Prefix regex and priority mapping; comma-split field order; analog block format (4 pipe-separated hex values);
 *   hex-to-voltage assumption V*100 for external/backup; Li-ion 1S voltage-to-percent curve for backup.
 * PROVISIONAL: Status flag bit mapping (STATUS_BIT_MAPS.RG_WF1) — TODO validate with real RG-WF1 packets.
 * PROVISIONAL: Field indices (e.g. which index is heading vs hdop) — TODO align with protocol doc.
 * TODO: Confirm ACC/ignition bit index; confirm external power bit index; calibrate backup percent if needed.
 */

import { DateTime } from 'luxon';

const DEVICE_TIMEZONE = process.env.DEVICE_TIMEZONE ?? 'Australia/Melbourne';

// --- Prefix normalization (confirmed) ---

export type PacketPriority = 'normal' | 'A' | 'B' | 'C';

const PREFIX_REGEX = /^&&(:|A|B|C)?133,/;

function normalizePrefix(raw: string): { priority: PacketPriority; body: string } | null {
  const trimmed = raw.trim();
  const match = trimmed.match(PREFIX_REGEX);
  if (!match) return null;
  const priorityChar = match[1];
  const priority: PacketPriority =
    priorityChar === undefined || priorityChar === ':'
      ? 'normal'
      : (priorityChar as 'A' | 'B' | 'C');
  const body = trimmed.slice(match[0].length);
  return { priority, body };
}

// --- GPS time: 12-digit DDMMYYHHMMSS as UTC -> ISO (reuse same convention as parser) ---

function parseGpsTimeUtc(token: string): string | null {
  if (!token || token.length !== 12 || !/^\d{12}$/.test(token)) return null;
  const dd = parseInt(token.slice(0, 2), 10);
  const mm = parseInt(token.slice(2, 4), 10) - 1;
  const yy = parseInt(token.slice(4, 6), 10);
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  const hh = parseInt(token.slice(6, 8), 10);
  const min = parseInt(token.slice(8, 10), 10);
  const ss = parseInt(token.slice(10, 12), 10);
  const d = new Date(Date.UTC(year, mm, dd, hh, min, ss));
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// --- Field indices for 133 (approximate; adjust if protocol doc differs) ---
// Order: imei, protocol, msgIndex, blank, timestamp, gpsValid, lat, lon, speed, hdopOrQuality, altitude, satellites, gsmSignal, ?, cellBlock, ?, statusFlags, io1, io2, analogBlock, alarmCode, checksum

const IDX_IMEI = 0;
const IDX_PROTOCOL = 1;
const IDX_MSG_INDEX = 2;
const IDX_BLANK = 3;
const IDX_TIMESTAMP = 4;
const IDX_GPS_VALID = 5;
const IDX_LAT = 6;
const IDX_LON = 7;
const IDX_SPEED = 8;
const IDX_HDOP = 9;
const IDX_ALTITUDE = 10;
const IDX_SATELLITES = 11;
const IDX_GSM = 12;
const IDX_CELL_BLOCK = 14;
const IDX_STATUS_FLAGS = 16;
const IDX_IO1 = 17;
const IDX_IO2 = 18;
const IDX_ANALOG_BLOCK = 19;
const IDX_ALARM_CODE = 20;
const IDX_CHECKSUM = 21;

const MIN_TOKENS_133 = 20;

// --- Decoded base packet (confirmed parsing) ---

export type DecodedPacket133 = {
  rawPacket: string;
  packetType: '133';
  packetPriority: PacketPriority;
  imei: string;
  timestamp: string | null;
  gpsValid: boolean | null;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  headingDeg: number | null;
  altitudeMeters: number | null;
  satellites: number | null;
  gpsQualityRaw: number | null;
  gsmSignalRaw: number | null;
  cellInfo: {
    mcc: string | null;
    mnc: string | null;
    lac: string | null;
    cellId: string | null;
  };
  rawBatteryField: string | null;
  rawStatusFlags: string | null;
  rawIo1: string | null;
  rawIo2: string | null;
  rawAnalogBlock: string | null;
  analogValues: string[];
  rawAlarmCode: string | null;
  checksum: string | null;
};

function safeFloat(s: string | undefined): number | null {
  if (s === undefined || s === '') return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function safeInt(s: string | undefined): number | null {
  if (s === undefined || s === '') return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

function clampLatLon(lat: number, lon: number): { lat: number; lon: number } | null {
  if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) return { lat, lon };
  return null;
}

/**
 * Decode base 133 packet into normalized structure. Returns null if not 133 or malformed.
 */
export function decodePacket133(rawLine: string): DecodedPacket133 | null {
  const norm = normalizePrefix(rawLine);
  if (!norm) return null;
  const { priority, body } = norm;
  const tokens = body.split(',').map((s) => s.trim());
  if (tokens.length < MIN_TOKENS_133) return null;

  const imei = tokens[IDX_IMEI] ?? '';
  if (!/^\d{12,20}$/.test(imei)) return null;

  const tsToken = tokens[IDX_TIMESTAMP];
  const timestamp = tsToken ? parseGpsTimeUtc(tsToken) : null;
  const gpsValidToken = tokens[IDX_GPS_VALID];
  const gpsValid = gpsValidToken === 'A' ? true : gpsValidToken === 'V' ? false : null;
  const lat = safeFloat(tokens[IDX_LAT]);
  const lon = safeFloat(tokens[IDX_LON]);
  const latLon = lat != null && lon != null ? clampLatLon(lat, lon) : null;
  const speed = safeFloat(tokens[IDX_SPEED]);
  const hdop = safeFloat(tokens[IDX_HDOP]);
  const headingRaw = safeFloat(tokens[IDX_HDOP]);
  const headingDeg = headingRaw != null && headingRaw >= 1 && headingRaw <= 360 ? headingRaw : null;
  const altitude = safeFloat(tokens[IDX_ALTITUDE]);
  const sats = safeInt(tokens[IDX_SATELLITES]);
  const gsm = safeInt(tokens[IDX_GSM]);
  const rawStatusFlags = tokens[IDX_STATUS_FLAGS] ?? null;
  const rawAnalogBlock = tokens[IDX_ANALOG_BLOCK] ?? null;
  const analogParsed = rawAnalogBlock ? parseAnalogBlock(rawAnalogBlock) : null;

  const cellBlock = tokens[IDX_CELL_BLOCK] ?? '';
  const cellInfo = parseCellBlock(cellBlock);

  return {
    rawPacket: rawLine.trim(),
    packetType: '133',
    packetPriority: priority,
    imei,
    timestamp,
    gpsValid,
    latitude: latLon?.lat ?? null,
    longitude: latLon?.lon ?? null,
    speedKph: speed != null && speed >= 0 && speed <= 500 ? speed : null,
    headingDeg: headingDeg != null && headingDeg >= 0 && headingDeg <= 360 ? headingDeg : null,
    altitudeMeters: altitude,
    satellites: sats != null && sats >= 0 ? sats : null,
    gpsQualityRaw: hdop,
    gsmSignalRaw: gsm != null && gsm >= 0 ? gsm : null,
    cellInfo,
    rawBatteryField: rawAnalogBlock,
    rawStatusFlags,
    rawIo1: tokens[IDX_IO1] ?? null,
    rawIo2: tokens[IDX_IO2] ?? null,
    rawAnalogBlock,
    analogValues: analogParsed?.values ?? [],
    rawAlarmCode: tokens[IDX_ALARM_CODE] ?? null,
    checksum: tokens[IDX_CHECKSUM] ?? null,
  };
}

// --- Analog block (provisional: hex values may be V*100 or other encoding) ---

export type ParsedAnalogBlock = {
  raw: string;
  values: string[];
  parsed: {
    externalPowerRaw: string;
    backupBatteryRaw: string;
    input3Raw: string;
    input4Raw: string;
  };
};

export function parseAnalogBlock(raw: string): ParsedAnalogBlock | null {
  const parts = raw.split('|').map((s) => s.trim());
  if (parts.length < 4) return null;
  return {
    raw,
    values: parts,
    parsed: {
      externalPowerRaw: parts[0] ?? '0000',
      backupBatteryRaw: parts[1] ?? '0000',
      input3Raw: parts[2] ?? '0000',
      input4Raw: parts[3] ?? '0000',
    },
  };
}

/** Hex (e.g. 052B) to voltage: provisional assumption V*100 in hex. 0x052B = 1323 => 13.23V. */
function hexToVoltage(hex: string): number | null {
  const n = parseInt(hex, 16);
  if (Number.isNaN(n)) return null;
  return Math.round((n / 100) * 100) / 100;
}

/** Same as parser.ts Li-ion 1S curve for backup battery percent. */
const BATTERY_CURVE: [number, number][] = [
  [4.2, 100],
  [4.1, 90],
  [4.0, 80],
  [3.9, 70],
  [3.8, 60],
  [3.7, 50],
  [3.4, 20],
  [3.2, 0],
];

function voltageToPercent(v: number): number {
  if (v >= 4.2) return 100;
  if (v <= 3.2) return 0;
  for (let i = 0; i < BATTERY_CURVE.length - 1; i++) {
    const [v1, p1] = BATTERY_CURVE[i];
    const [v2, p2] = BATTERY_CURVE[i + 1];
    if (v <= v1 && v >= v2) {
      const t = (v1 - v) / (v1 - v2);
      return Math.round(p1 + t * (p2 - p1));
    }
  }
  return 0;
}

/**
 * Estimate backup battery percent from voltage or raw hex. Isolated for easy calibration later.
 * TODO: Validate with real RG-WF1 packets; may need model-specific curve or lookup.
 */
export function estimateBackupBatteryPercent(
  voltageV: number | null,
  _rawHex: string | null,
  _modelCode: string
): number | null {
  if (voltageV == null) return null;
  const pct = voltageToPercent(voltageV);
  return Math.max(0, Math.min(100, pct));
}

// --- Status flags: reusable decoder with named bits (provisional mapping) ---

export type StatusFlagsDecoded = {
  raw: string;
  decimal: number;
  binary: string;
  flags: {
    accOn: boolean | null;
    externalPowerConnected: boolean | null;
    charging: boolean | null;
    gpsActive: boolean | null;
    vibration: boolean | null;
  };
};

/** Bit index -> name for RG-WF1. TODO: Confirm with real device / protocol doc. */
const STATUS_BIT_MAPS: Record<string, { bitIndex: number; flag: keyof StatusFlagsDecoded['flags'] }[]> = {
  RG_WF1: [
    { bitIndex: 0, flag: 'accOn' },
    { bitIndex: 1, flag: 'externalPowerConnected' },
    { bitIndex: 2, flag: 'charging' },
    { bitIndex: 3, flag: 'gpsActive' },
    { bitIndex: 4, flag: 'vibration' },
  ],
};

export function decodeStatusFlags(
  rawStatusFlags: string | null,
  modelCode: string
): StatusFlagsDecoded | null {
  if (!rawStatusFlags || !/^[0-9A-Fa-f]{2,4}$/.test(rawStatusFlags)) return null;
  const decimal = parseInt(rawStatusFlags, 16);
  if (Number.isNaN(decimal)) return null;
  const bits = Math.min(16, rawStatusFlags.length * 4);
  const binary = decimal.toString(2).padStart(bits, '0');

  const map = STATUS_BIT_MAPS[modelCode] ?? STATUS_BIT_MAPS.RG_WF1;
  const flags: StatusFlagsDecoded['flags'] = {
    accOn: null,
    externalPowerConnected: null,
    charging: null,
    gpsActive: null,
    vibration: null,
  };
  for (const { bitIndex, flag } of map) {
    const bit = (decimal >> bitIndex) & 1;
    (flags as Record<string, boolean | null>)[flag] = bit === 1;
  }
  return { raw: rawStatusFlags, decimal, binary, flags };
}

// --- Cell block: minimal parse (MCC|MNC|LAC|CellId or similar) ---

function parseCellBlock(block: string): DecodedPacket133['cellInfo'] {
  const parts = block.split('|').map((s) => s.trim());
  return {
    mcc: parts[0] ?? null,
    mnc: parts[1] ?? null,
    lac: parts[2] ?? null,
    cellId: parts[3] ?? null,
  };
}

// --- Model-specific telemetry interpretation ---

export type RgWf1Telemetry = {
  modelCode: 'RG-WF1';
  isWired: true;
  hasBackupBattery: true;
  hasAcc: true;
  accStatus: 'on' | 'off' | 'unknown';
  externalPowerConnected: boolean | null;
  externalPowerVoltage: number | null;
  powerSource: 'external' | 'backup_battery' | 'unknown';
  backupBatteryVoltage: number | null;
  backupBatteryPercent: number | null;
  packetPriority: PacketPriority;
};

export function interpretTelemetryByModel(
  modelCode: string,
  decoded: DecodedPacket133
): RgWf1Telemetry | null {
  if (modelCode !== 'RG-WF1') return null;

  const statusDecoded = decodeStatusFlags(decoded.rawStatusFlags, 'RG_WF1');
  const analog = decoded.rawAnalogBlock ? parseAnalogBlock(decoded.rawAnalogBlock) : null;

  const externalPowerConnectedFromFlags =
    statusDecoded?.flags.externalPowerConnected ?? null;
  const accOn = statusDecoded?.flags.accOn ?? null;
  const accStatus: 'on' | 'off' | 'unknown' =
    accOn === true ? 'on' : accOn === false ? 'off' : 'unknown';

  const externalPowerRaw = analog?.parsed.externalPowerRaw ?? '0000';
  const backupBatteryRaw = analog?.parsed.backupBatteryRaw ?? '0000';
  const externalPowerVoltage = hexToVoltage(externalPowerRaw);
  const backupBatteryVoltage = hexToVoltage(backupBatteryRaw);
  const backupBatteryPercent = estimateBackupBatteryPercent(
    backupBatteryVoltage,
    backupBatteryRaw,
    'RG-WF1'
  );

  // External power: prefer status bit; if unknown, infer from voltage (e.g. > 5V => connected).
  let externalPowerConnected = externalPowerConnectedFromFlags;
  if (externalPowerConnected === null && externalPowerVoltage != null) {
    externalPowerConnected = externalPowerVoltage > 5;
  }

  let powerSource: 'external' | 'backup_battery' | 'unknown' = 'unknown';
  if (externalPowerConnected === true) powerSource = 'external';
  else if (externalPowerConnected === false && (backupBatteryVoltage != null || backupBatteryPercent != null))
    powerSource = 'backup_battery';

  return {
    modelCode: 'RG-WF1',
    isWired: true,
    hasBackupBattery: true,
    hasAcc: true,
    accStatus,
    externalPowerConnected,
    externalPowerVoltage,
    powerSource,
    backupBatteryVoltage,
    backupBatteryPercent,
    packetPriority: decoded.packetPriority,
  };
}

// --- Integration: DecodedPacket133 + RgWf1Telemetry -> location row shape (same as parser.ParsedLocation) ---

export type ParsedLocation133 = {
  device_id: string;
  gps_time: string | null;
  gps_valid: boolean | null;
  latitude: number | null;
  longitude: number | null;
  speed_kph: number | null;
  course_deg: number | null;
  event_code: string | null;
  raw_payload: string;
  extra: Record<string, unknown>;
};

export function packet133ToParsedLocation(
  decoded: DecodedPacket133,
  interpreted: RgWf1Telemetry | null
): ParsedLocation133 {
  const extra: Record<string, unknown> = {
    packet_type_133: true,
    packet_priority: decoded.packetPriority,
    packet_133: {
      packetType: decoded.packetType,
      packetPriority: decoded.packetPriority,
      rawStatusFlags: decoded.rawStatusFlags,
      rawAnalogBlock: decoded.rawAnalogBlock,
      analogValues: decoded.analogValues,
    },
  };

  if (decoded.timestamp) {
    const utc = DateTime.fromISO(decoded.timestamp, { zone: 'utc' });
    const local = utc.setZone(DEVICE_TIMEZONE);
    extra.time = { gps_time_local: local.toISO(), timezone: DEVICE_TIMEZONE };
  }

  const csq = decoded.gsmSignalRaw ?? 99;
  const gsmQuality = csq <= 5 ? 'none' : csq <= 10 ? 'poor' : csq <= 15 ? 'ok' : csq <= 22 ? 'good' : csq <= 31 ? 'great' : 'unknown';
  extra.signal = {
    gps: {
      valid: decoded.gpsValid ?? false,
      fix_flag: decoded.gpsValid === true ? 'A' : 'V',
      sats: decoded.satellites ?? 0,
      hdop: decoded.gpsQualityRaw ?? 0,
      speed_kmh: decoded.speedKph ?? 0,
      course_deg: decoded.headingDeg ?? 0,
      has_signal: (decoded.gpsValid === true && (decoded.satellites ?? 0) >= 3),
    },
    gsm: {
      csq,
      percent: decoded.gsmSignalRaw != null && decoded.gsmSignalRaw <= 31 ? Math.round((decoded.gsmSignalRaw / 31) * 100) : null,
      quality: gsmQuality,
    },
  };
  extra.gps_lock = decoded.gpsValid === true;

  const statusDecoded = decodeStatusFlags(decoded.rawStatusFlags, 'RG_WF1');
  if (statusDecoded) {
    extra.status_flags_133 = statusDecoded;
  }

  const analog = decoded.rawAnalogBlock ? parseAnalogBlock(decoded.rawAnalogBlock) : null;
  if (analog) {
    extra.analog_block_133 = analog;
  }

  extra.power = {
    ext_voltage_v: interpreted?.externalPowerVoltage ?? hexToVoltage(analog?.parsed.externalPowerRaw ?? ''),
    battery_voltage_v: interpreted?.backupBatteryVoltage ?? hexToVoltage(analog?.parsed.backupBatteryRaw ?? ''),
    source: 'packet_133',
  };

  extra.battery = interpreted?.backupBatteryPercent != null
    ? { voltage_v: interpreted.backupBatteryVoltage ?? undefined, percent: interpreted.backupBatteryPercent, curve: 'pt60_curve_v1' }
    : undefined;

  extra.pt60_state = {
    ext_power_connected: interpreted?.externalPowerConnected ?? null,
    is_stopped: null,
    gps_status_bit: decoded.gpsValid === true ? 1 : 0,
  };

  extra.wired_power = {
    external_power_connected: interpreted?.externalPowerConnected ?? null,
    acc_status: interpreted?.accStatus ?? null,
    backup_battery_voltage_v: interpreted?.backupBatteryVoltage ?? null,
    backup_battery_percent: interpreted?.backupBatteryPercent ?? null,
  };

  if (interpreted) {
    extra.rg_wf1_telemetry = interpreted;
  }

  return {
    device_id: decoded.imei,
    gps_time: decoded.timestamp,
    gps_valid: decoded.gpsValid,
    latitude: decoded.latitude,
    longitude: decoded.longitude,
    speed_kph: decoded.speedKph,
    course_deg: decoded.headingDeg,
    event_code: decoded.rawAlarmCode,
    raw_payload: decoded.rawPacket,
    extra,
  };
}

// --- Public entry: parse 133 packet into ParsedLocation133 or null ---

export function parsePacket133Line(rawLine: string): ParsedLocation133 | null {
  const decoded = decodePacket133(rawLine);
  if (!decoded) return null;
  const interpreted = interpretTelemetryByModel('RG-WF1', decoded);
  return packet133ToParsedLocation(decoded, interpreted);
}
