/**
 * iStartek protocol decoder for packet length 133 (RG-WF1 wired tracker and similar).
 *
 * Header: &&<pack-no><pack-len>, e.g. &&V133, &&:133, &&=133, &&A133 — the character after && is
 * packet sequence number (packNo), the digits are packet length (133). The actual report type is
 * in the cmd field (000 = ordinary positioning, 010 = with ack, 020 = compressed, 030 = heartbeat).
 *
 * Field order after header: deviceId, commandCode, alarmCode, alarmData, date-time, fix_flag,
 * latitude, longitude, satQuantity, hdop, speed, course, altitude, odometer, cellBlock, csq,
 * system-sta, in-sta, out-sta, voltageBlock, pro-code, [fuel], [temp], checksum.
 *
 * Voltage block: 4 hex values pipe-separated; voltage = hex / 100 (e.g. 052B => 13.23V).
 * System status: hex bitmask; bits 0–8 per protocol (GPRS IP1/IP2, GPS valid, external power, etc.).
 *
 * PROVISIONAL: Backup battery percent from voltage uses a Li-ion 1S curve; may need tuning for device.
 */

import { DateTime } from 'luxon';

const DEVICE_TIMEZONE = process.env.DEVICE_TIMEZONE ?? 'Australia/Melbourne';

// --- Header: pack-no (single char) + pack-len (digits). Only packet length 133 is decoded here. ---

export type IstartekHeader = {
  packetHeader: string;
  packetNo: string;
  packetLength: number;
  body: string;
};

const HEADER_REGEX = /^&&(.)(\d+),/;

/**
 * Parse iStartek packet header. Character after && is packet sequence (packNo), digits are length.
 * Returns null if not &&<char><digits>, or if packetLength !== 133 (this decoder only handles 133).
 */
export function parseIstartekHeader(rawPacket: string): IstartekHeader | null {
  const trimmed = rawPacket.trim();
  const match = trimmed.match(HEADER_REGEX);
  if (!match) return null;
  const packetNo = match[1];
  const packetLength = parseInt(match[2], 10);
  if (packetLength !== 133) return null;
  const packetHeader = match[0].replace(/,$/, '');
  const body = trimmed.slice(match[0].length);
  return { packetHeader, packetNo, packetLength, body };
}

/** Backward compatibility: map packetNo to legacy priority label for existing consumers. */
export type PacketPriority = 'normal' | 'A' | 'B' | 'C';

function packetNoToPriority(packetNo: string): PacketPriority {
  if (packetNo === 'A') return 'A';
  if (packetNo === 'B') return 'B';
  if (packetNo === 'C') return 'C';
  return 'normal';
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

// --- Field indices per iStartek protocol (after header) ---
// deviceId, commandCode, alarmCode, alarmData, date-time, fix_flag, lat, lon, satQuantity, hdop, speed, course, altitude, odometer, cellBlock, csq, system-sta, in-sta, out-sta, voltageBlock, pro-code, [fuel], [temp], checksum

const IDX_DEVICE_ID = 0;
const IDX_CMD = 1;
const IDX_ALARM_CODE = 2;
const IDX_ALARM_DATA = 3;
const IDX_TIMESTAMP = 4;
const IDX_FIX_FLAG = 5;
const IDX_LAT = 6;
const IDX_LON = 7;
const IDX_SAT_QUANTITY = 8;
const IDX_HDOP = 9;
const IDX_SPEED = 10;
const IDX_COURSE = 11;
const IDX_ALTITUDE = 12;
const IDX_ODOMETER = 13;
const IDX_CELL_BLOCK = 14;
const IDX_CSQ = 15;
const IDX_SYSTEM_STA = 16;
const IDX_IN_STA = 17;
const IDX_OUT_STA = 18;
const IDX_VOLTAGE_BLOCK = 19;
const IDX_PRO_CODE = 20;
const IDX_CHECKSUM = 21;

const MIN_TOKENS_133 = 22;

// --- Decoded base packet (iStartek 133 field order) ---

export type DecodedPacket133 = {
  rawPacket: string;
  packetType: '133';
  packetHeader: string;
  packetNo: string;
  packetLength: number;
  /** Legacy: same as packetNo mapped to normal/A/B/C for backward compat. */
  packetPriority: PacketPriority;
  commandCode: string;
  imei: string;
  alarmCode: string | null;
  alarmData: string | null;
  timestamp: string | null;
  gpsValid: boolean | null;
  latitude: number | null;
  longitude: number | null;
  satQuantity: number | null;
  hdop: number | null;
  speedKph: number | null;
  courseDeg: number | null;
  altitudeMeters: number | null;
  odometerMeters: number | null;
  cellInfo: {
    mcc: string | null;
    mnc: string | null;
    lac: string | null;
    cellId: string | null;
  };
  csq: number | null;
  rawSystemStatus: string | null;
  rawInputStatus: string | null;
  rawOutputStatus: string | null;
  rawAnalogBlock: string | null;
  analogValues: string[];
  protocolVersion: string | null;
  rawBatteryField: string | null;
  rawStatusFlags: string | null;
  rawIo1: string | null;
  rawIo2: string | null;
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
 * Parse comma-separated body into field map. Used by decodePacket133.
 */
export function parseIstartekFields(body: string): string[] {
  return body.split(',').map((s) => s.trim());
}

/**
 * Decode base 133 packet into normalized structure. Returns null if not 133 or malformed.
 * Uses correct iStartek field order: satQuantity at 8, hdop at 9, speed at 10, course at 11, etc.
 */
export function decodePacket133(rawLine: string): DecodedPacket133 | null {
  const header = parseIstartekHeader(rawLine);
  if (!header) return null;
  const { packetHeader, packetNo, packetLength, body } = header;
  const tokens = parseIstartekFields(body);
  if (tokens.length < MIN_TOKENS_133) return null;

  const imei = tokens[IDX_DEVICE_ID] ?? '';
  if (!/^\d{12,20}$/.test(imei)) return null;

  const commandCode = tokens[IDX_CMD] ?? '';
  const tsToken = tokens[IDX_TIMESTAMP];
  const timestamp = tsToken ? parseGpsTimeUtc(tsToken) : null;
  const fixFlag = tokens[IDX_FIX_FLAG];
  const gpsValid = fixFlag === 'A' ? true : fixFlag === 'V' ? false : null;
  const lat = safeFloat(tokens[IDX_LAT]);
  const lon = safeFloat(tokens[IDX_LON]);
  const latLon = lat != null && lon != null ? clampLatLon(lat, lon) : null;
  const satQuantity = safeInt(tokens[IDX_SAT_QUANTITY]);
  const hdop = safeFloat(tokens[IDX_HDOP]);
  const speed = safeFloat(tokens[IDX_SPEED]);
  const courseDeg = safeFloat(tokens[IDX_COURSE]);
  const altitude = safeFloat(tokens[IDX_ALTITUDE]);
  const odometer = safeFloat(tokens[IDX_ODOMETER]);
  const csq = safeInt(tokens[IDX_CSQ]);
  const rawSystemStatus = tokens[IDX_SYSTEM_STA] ?? null;
  const rawInputStatus = tokens[IDX_IN_STA] ?? null;
  const rawOutputStatus = tokens[IDX_OUT_STA] ?? null;
  const rawAnalogBlock = tokens[IDX_VOLTAGE_BLOCK] ?? null;
  const analogParsed = rawAnalogBlock ? parseAnalogBlock(rawAnalogBlock) : null;
  const protocolVersion = tokens[IDX_PRO_CODE] ?? null;

  const cellBlock = tokens[IDX_CELL_BLOCK] ?? '';
  const cellInfo = parseCellBlock(cellBlock);

  return {
    rawPacket: rawLine.trim(),
    packetType: '133',
    packetHeader,
    packetNo,
    packetLength,
    packetPriority: packetNoToPriority(packetNo),
    commandCode,
    imei,
    alarmCode: tokens[IDX_ALARM_CODE] ?? null,
    alarmData: tokens[IDX_ALARM_DATA] ?? null,
    timestamp,
    gpsValid,
    latitude: latLon?.lat ?? null,
    longitude: latLon?.lon ?? null,
    satQuantity: satQuantity != null && satQuantity >= 0 ? satQuantity : null,
    hdop: hdop != null && hdop >= 0 ? hdop : null,
    speedKph: speed != null && speed >= 0 && speed <= 500 ? speed : null,
    courseDeg: courseDeg != null && courseDeg >= 0 && courseDeg <= 360 ? courseDeg : null,
    altitudeMeters: altitude,
    odometerMeters: odometer,
    cellInfo,
    csq: csq != null && csq >= 0 ? csq : null,
    rawSystemStatus,
    rawInputStatus,
    rawOutputStatus,
    rawAnalogBlock,
    analogValues: analogParsed?.values ?? [],
    protocolVersion,
    rawBatteryField: rawAnalogBlock,
    rawStatusFlags: rawSystemStatus,
    rawIo1: rawInputStatus,
    rawIo2: rawOutputStatus,
    rawAlarmCode: tokens[IDX_ALARM_CODE] ?? null,
    checksum: tokens[IDX_CHECKSUM] ?? null,
  };
}

// --- Voltage block: 4 pipe-separated hex values; voltage = hex / 100 (per protocol) ---

export type ParsedVoltageBlock = {
  raw: string;
  externalPowerRaw: string;
  backupBatteryRaw: string;
  ad1Raw: string;
  ad2Raw: string;
  externalPowerVoltage: number | null;
  backupBatteryVoltage: number | null;
  ad1Voltage: number | null;
  ad2Voltage: number | null;
};

function hexToInt(hex: string): number | null {
  const n = parseInt(hex, 16);
  return Number.isNaN(n) ? null : n;
}

/** Voltage = hex value / 100. E.g. 052B => 1323 => 13.23V (per iStartek protocol). */
export function hexToVoltage(hex: string): number | null {
  const n = hexToInt(hex);
  if (n == null) return null;
  return Math.round((n / 100) * 100) / 100;
}

/**
 * Parse voltage block "052B|0194|0000|0000" into raw hex strings and voltages (hex/100).
 */
export function parseVoltageBlock(raw: string): ParsedVoltageBlock | null {
  const parts = raw.split('|').map((s) => s.trim());
  if (parts.length < 4) return null;
  const externalPowerRaw = parts[0] ?? '0000';
  const backupBatteryRaw = parts[1] ?? '0000';
  const ad1Raw = parts[2] ?? '0000';
  const ad2Raw = parts[3] ?? '0000';
  return {
    raw,
    externalPowerRaw,
    backupBatteryRaw,
    ad1Raw,
    ad2Raw,
    externalPowerVoltage: hexToVoltage(externalPowerRaw),
    backupBatteryVoltage: hexToVoltage(backupBatteryRaw),
    ad1Voltage: hexToVoltage(ad1Raw),
    ad2Voltage: hexToVoltage(ad2Raw),
  };
}

// --- Analog block (alias for backward compat; same as voltage block) ---

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
  const v = parseVoltageBlock(raw);
  if (!v) return null;
  return {
    raw: v.raw,
    values: [v.externalPowerRaw, v.backupBatteryRaw, v.ad1Raw, v.ad2Raw],
    parsed: {
      externalPowerRaw: v.externalPowerRaw,
      backupBatteryRaw: v.backupBatteryRaw,
      input3Raw: v.ad1Raw,
      input4Raw: v.ad2Raw,
    },
  };
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

// --- System status: hex bitmask per iStartek protocol ---

export type SystemStatusDecoded = {
  raw: string;
  numeric: number;
  binary: string;
  ip1Connected: boolean;
  ip2Connected: boolean;
  gpsValidBit: boolean;
  externalPowerConnected: boolean;
  gpsAntennaConnected: boolean;
  stopped: boolean;
  armed: boolean;
  rfidLoggedIn: boolean;
  shedding: boolean;
};

/**
 * Decode system-sta hex field. Bits per protocol:
 * bit0: GPRS connection status of IP1, bit1: GPRS IP2, bit2: GPS valid, bit3: external power connected,
 * bit4: GPS antenna connected, bit5: stop status (1=stop, 0=move), bit6: armed, bit7: RFID/iButton login, bit8: shedding.
 */
export function decodeSystemStatus(rawSystemStatus: string | null): SystemStatusDecoded | null {
  if (!rawSystemStatus || !/^[0-9A-Fa-f]{2,4}$/.test(rawSystemStatus)) return null;
  const numeric = parseInt(rawSystemStatus, 16);
  if (Number.isNaN(numeric)) return null;
  const bits = Math.min(16, rawSystemStatus.length * 4);
  const binary = numeric.toString(2).padStart(bits, '0');
  return {
    raw: rawSystemStatus,
    numeric,
    binary,
    ip1Connected: ((numeric >> 0) & 1) === 1,
    ip2Connected: ((numeric >> 1) & 1) === 1,
    gpsValidBit: ((numeric >> 2) & 1) === 1,
    externalPowerConnected: ((numeric >> 3) & 1) === 1,
    gpsAntennaConnected: ((numeric >> 4) & 1) === 1,
    stopped: ((numeric >> 5) & 1) === 1,
    armed: ((numeric >> 6) & 1) === 1,
    rfidLoggedIn: ((numeric >> 7) & 1) === 1,
    shedding: ((numeric >> 8) & 1) === 1,
  };
}

/** Legacy alias for backward compat; uses same bit mapping as decodeSystemStatus for RG-WF1. */
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

export function decodeStatusFlags(
  rawStatusFlags: string | null,
  _modelCode: string
): StatusFlagsDecoded | null {
  const s = decodeSystemStatus(rawStatusFlags);
  if (!s) return null;
  return {
    raw: s.raw,
    decimal: s.numeric,
    binary: s.binary,
    flags: {
      accOn: null,
      externalPowerConnected: s.externalPowerConnected,
      charging: null,
      gpsActive: s.gpsValidBit,
      vibration: null,
    },
  };
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
  packetNo: string;
  packetLength: number;
  commandCode: string;
  gpsValid: boolean | null;
  latitude: number | null;
  longitude: number | null;
  satellites: number | null;
  hdop: number | null;
  speedKph: number | null;
  courseDeg: number | null;
  altitudeMeters: number | null;
  csq: number | null;
  externalPowerConnected: boolean | null;
  stopped: boolean | null;
  externalPowerVoltage: number | null;
  backupBatteryVoltage: number | null;
  backupBatteryPercent: number | null;
  powerSource: 'external' | 'backup_battery' | 'unknown';
  packetPriority: PacketPriority;
};

/**
 * Normalize decoded 133 packet for RG-WF1: expose packetNo, packetLength, commandCode,
 * gpsValid, speedKph, satellites, hdop, stopped, voltages, backup percent, etc.
 */
export function normalizeRgWf1Telemetry(decoded: DecodedPacket133): RgWf1Telemetry {
  const statusDecoded = decodeSystemStatus(decoded.rawSystemStatus);
  const voltageBlock = decoded.rawAnalogBlock ? parseVoltageBlock(decoded.rawAnalogBlock) : null;

  const externalPowerConnected = statusDecoded?.externalPowerConnected ?? null;
  const stopped = statusDecoded?.stopped ?? null;
  const externalPowerVoltage = voltageBlock?.externalPowerVoltage ?? null;
  const backupBatteryVoltage = voltageBlock?.backupBatteryVoltage ?? null;
  const backupBatteryPercent = estimateBackupBatteryPercent(
    backupBatteryVoltage,
    voltageBlock?.backupBatteryRaw ?? null,
    'RG-WF1'
  );

  let powerSource: 'external' | 'backup_battery' | 'unknown' = 'unknown';
  if (externalPowerConnected === true) powerSource = 'external';
  else if (externalPowerConnected === false && (backupBatteryVoltage != null || backupBatteryPercent != null))
    powerSource = 'backup_battery';

  return {
    modelCode: 'RG-WF1',
    isWired: true,
    hasBackupBattery: true,
    hasAcc: true,
    accStatus: 'unknown',
    packetNo: decoded.packetNo,
    packetLength: decoded.packetLength,
    commandCode: decoded.commandCode,
    gpsValid: decoded.gpsValid,
    latitude: decoded.latitude,
    longitude: decoded.longitude,
    satellites: decoded.satQuantity,
    hdop: decoded.hdop,
    speedKph: decoded.speedKph,
    courseDeg: decoded.courseDeg,
    altitudeMeters: decoded.altitudeMeters,
    csq: decoded.csq,
    externalPowerConnected,
    stopped,
    externalPowerVoltage,
    backupBatteryVoltage,
    backupBatteryPercent,
    powerSource,
    packetPriority: decoded.packetPriority,
  };
}

export function interpretTelemetryByModel(
  modelCode: string,
  decoded: DecodedPacket133
): RgWf1Telemetry | null {
  if (modelCode !== 'RG-WF1') return null;
  return normalizeRgWf1Telemetry(decoded);
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
    packet_no: decoded.packetNo,
    packet_length: decoded.packetLength,
    command_code: decoded.commandCode,
    packet_133: {
      packetType: decoded.packetType,
      packetNo: decoded.packetNo,
      packetLength: decoded.packetLength,
      commandCode: decoded.commandCode,
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

  const csq = decoded.csq ?? 99;
  const gsmQuality = csq <= 5 ? 'none' : csq <= 10 ? 'poor' : csq <= 15 ? 'ok' : csq <= 22 ? 'good' : csq <= 31 ? 'great' : 'unknown';
  extra.signal = {
    gps: {
      valid: decoded.gpsValid ?? false,
      fix_flag: decoded.gpsValid === true ? 'A' : 'V',
      sats: decoded.satQuantity ?? 0,
      hdop: decoded.hdop ?? 0,
      speed_kmh: decoded.speedKph ?? 0,
      course_deg: decoded.courseDeg ?? 0,
      has_signal: (decoded.gpsValid === true && (decoded.satQuantity ?? 0) >= 3),
    },
    gsm: {
      csq,
      percent: decoded.csq != null && decoded.csq <= 31 ? Math.round((decoded.csq / 31) * 100) : null,
      quality: gsmQuality,
    },
  };
  extra.gps_lock = decoded.gpsValid === true;

  const systemStatus = decodeSystemStatus(decoded.rawSystemStatus);
  if (systemStatus) {
    extra.system_status_133 = systemStatus;
  }
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
    is_stopped: interpreted?.stopped ?? null,
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
    course_deg: decoded.courseDeg,
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
