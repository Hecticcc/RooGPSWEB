import { DateTime } from 'luxon';

const DEVICE_TIMEZONE = process.env.DEVICE_TIMEZONE ?? 'Australia/Melbourne';

// --- Line normalization ---

export type NormalizedLine = {
  tokens: string[];
  packetLength: number | null;
  rawPayload: string;
};

export function normalizeLine(rawLine: string): NormalizedLine | null {
  const raw = rawLine.trim();
  if (!raw.startsWith('&&')) return null;
  const rawPayload = raw;
  let body = raw.slice(2); // after "&&"
  let packetLength: number | null = null;
  if (body.startsWith(':')) {
    const commaIdx = body.indexOf(',');
    if (commaIdx >= 0) {
      const lenStr = body.slice(1, commaIdx).trim();
      if (/^\d+$/.test(lenStr)) packetLength = parseInt(lenStr, 10);
      body = body.slice(commaIdx + 1);
    } else {
      const lenStr = body.slice(1).trim();
      if (/^\d+$/.test(lenStr)) packetLength = parseInt(lenStr, 10);
      body = '';
    }
  } else if (body.startsWith(',')) {
    body = body.slice(1);
  }
  const tokens = body.split(',').map((s) => s.trim());
  return { tokens, packetLength, rawPayload };
}

// --- GPS time: 12-digit DDMMYYHHMMSS as UTC -> ISO ---

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

// --- Lat/lon: decimal or DDMM.MMMM ---

function toDecimalDegrees(ddmm: number, isLongitude: boolean): number {
  const sign = ddmm < 0 ? -1 : 1;
  const abs = Math.abs(ddmm);
  const deg = Math.floor(abs / 100);
  const min = abs - deg * 100;
  const decimal = sign * (deg + min / 60);
  return Math.round(decimal * 1e6) / 1e6;
}

function parseLatLon(value: number, isLon: boolean): number {
  const limit = isLon ? 180 : 90;
  if (value >= -limit && value <= limit) return value;
  return toDecimalDegrees(value, isLon);
}

// --- Battery: Li-ion 1S curve (piecewise linear) ---

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

/** GSM CSQ quality label (0-31 or 99 unknown). */
function gsmQualityLabel(csq: number): string {
  if (csq <= 5) return 'none';
  if (csq <= 10) return 'poor';
  if (csq <= 15) return 'ok';
  if (csq <= 22) return 'good';
  if (csq <= 31) return 'great';
  return 'unknown';
}

/** iStartek Protocol v2.2: field order for cmd 000/010/020 (after date-time at index 4). */
const PT60_CMD_POSITION_PARSED = ['000', '010', '020'] as const;
const DATE_TIME_IDX = 4;
const FIX_FLAG_IDX = 5;
const LAT_IDX = 6;
const LON_IDX = 7;
const SAT_QUANTITY_IDX = 8;
const HDOP_IDX = 9;
const SPEED_IDX = 10;
const COURSE_IDX = 11;
const ALTITUDE_IDX = 12;
const ODOMETER_IDX = 13;
const CELL_IDX = 14;
const CSQ_IDX = 15;
const MIN_TOKENS_POSITION_BASED = 20;

/** Satellite connectivity tier for UI (bar + colour). Not shown: raw HDOP. */
export type SatelliteConnectivityTier = 'good' | 'fair' | 'weak' | 'poor';

export type SignalGpsConnectivity = {
  sats: number;
  hdop: number;
  barPercent: number;
  tier: SatelliteConnectivityTier;
  colour: SatelliteConnectivityTier;
};

export type SignalGps = {
  fix_flag: string;
  valid: boolean;
  sats: number;
  hdop: number;
  speed_kmh: number;
  course_deg: number;
  has_signal: boolean;
  connectivity?: SignalGpsConnectivity;
};

export type SignalGsm = {
  csq: number;
  percent: number | null;
  quality: string;
};

export type SignalExtra = {
  gps: SignalGps;
  gsm: SignalGsm;
};

/**
 * Satellite connectivity score from sats + HDOP. Used for bar and colour only; HDOP not shown in UI.
 * Deterministic, pure function for testing.
 */
export function computeSatelliteConnectivity(
  valid: boolean,
  sats: number,
  hdop: number
): SignalGpsConnectivity {
  const satsClamped = Math.max(0, Math.min(99, sats));
  const hdopVal = typeof hdop === 'number' && !Number.isNaN(hdop) ? hdop : 99;

  if (!valid) {
    return { sats: satsClamped, hdop: hdopVal, barPercent: 0, tier: 'poor', colour: 'poor' };
  }
  if (satsClamped < 3) {
    return { sats: satsClamped, hdop: hdopVal, barPercent: 15, tier: 'poor', colour: 'poor' };
  }

  const satelliteScore = Math.min((satsClamped / 10) * 100, 100);

  let hdopModifier: number;
  if (hdopVal <= 1.5) {
    hdopModifier = 1.0;
  } else if (hdopVal <= 2.5) {
    hdopModifier = 0.9;
  } else if (hdopVal <= 4.0) {
    hdopModifier = 0.75;
  } else if (hdopVal <= 6.0) {
    hdopModifier = 0.6;
  } else {
    hdopModifier = 0.4;
  }

  const barPercent = Math.round(satelliteScore * hdopModifier);

  let tier: SatelliteConnectivityTier;
  if (barPercent >= 75) {
    tier = 'good';
  } else if (barPercent >= 45) {
    tier = 'fair';
  } else if (barPercent >= 20) {
    tier = 'weak';
  } else {
    tier = 'poor';
  }

  return { sats: satsClamped, hdop: hdopVal, barPercent, tier, colour: tier };
}

function parsePositionBasedFields(
  tokens: string[],
  empty: IStartekParsed,
  deviceId: string | null
): void {
  const cmd = empty.msgType ?? '';
  if (!PT60_CMD_POSITION_PARSED.includes(cmd as (typeof PT60_CMD_POSITION_PARSED)[number]) || tokens.length < MIN_TOKENS_POSITION_BASED) {
    return;
  }
  const fixFlag = tokens[FIX_FLAG_IDX];
  if (fixFlag !== 'A' && fixFlag !== 'V') {
    empty.extra.parseError = `position_based: invalid fix_flag at ${FIX_FLAG_IDX}`;
    if (deviceId) (empty.extra as Record<string, unknown>).parseErrorDeviceId = deviceId;
    return;
  }
  const lat = parseFloat(tokens[LAT_IDX]);
  const lon = parseFloat(tokens[LON_IDX]);
  const satQuantity = parseInt(tokens[SAT_QUANTITY_IDX], 10);
  const hdop = parseFloat(tokens[HDOP_IDX]);
  const speedKmh = parseFloat(tokens[SPEED_IDX]);
  const courseDeg = parseFloat(tokens[COURSE_IDX]);
  if (isNaN(lat) || isNaN(lon)) {
    empty.extra.parseError = `position_based: invalid lat/lon at ${LAT_IDX}/${LON_IDX}`;
    if (deviceId) (empty.extra as Record<string, unknown>).parseErrorDeviceId = deviceId;
    return;
  }
  const gpsFixValid = fixFlag === 'A';
  empty.gpsValid = gpsFixValid;
  empty.latitude = parseLatLon(lat, false);
  empty.longitude = parseLatLon(lon, true);
  if (!isNaN(speedKmh) && speedKmh >= 0 && speedKmh <= 500) empty.speedKph = speedKmh;
  if (!isNaN(courseDeg) && courseDeg >= 0 && courseDeg <= 360) empty.courseDeg = courseDeg;

  const satsNum = isNaN(satQuantity) ? 0 : Math.max(0, satQuantity);
  const hdopNum = isNaN(hdop) ? 0 : hdop;
  const connectivity = computeSatelliteConnectivity(gpsFixValid, satsNum, hdopNum);

  const csqRaw = parseInt(tokens[CSQ_IDX], 10);
  const gsmCsq = isNaN(csqRaw) ? 99 : Math.max(0, Math.min(99, csqRaw));
  const gsmPercent = gsmCsq >= 0 && gsmCsq <= 31 ? Math.round((gsmCsq / 31) * 100) : null;
  const gsmQuality = gsmQualityLabel(gsmCsq);

  const signal: SignalExtra = {
    gps: {
      fix_flag: fixFlag,
      valid: gpsFixValid,
      sats: satsNum,
      hdop: hdopNum,
      speed_kmh: isNaN(speedKmh) ? 0 : speedKmh,
      course_deg: isNaN(courseDeg) ? 0 : courseDeg,
      has_signal: gpsFixValid && satsNum >= 3,
      connectivity,
    },
    gsm: {
      csq: gsmCsq,
      percent: gsmPercent,
      quality: gsmQuality,
    },
  };
  empty.extra.signal = signal;
}

/** Alternate layout: optional empty token before time (e.g. event 23) so time at 5, fix at 6, lat 7, lon 8, speed 9, course 10; sats/hdop/CSQ in following tokens. */
const FIX_IDX_ALT = 6;
const LAT_IDX_ALT = 7;
const LON_IDX_ALT = 8;
const SPEED_IDX_ALT = 9;
const COURSE_IDX_ALT = 10;
const SAT_QUANTITY_IDX_ALT = 12;
const HDOP_IDX_ALT = 13;
const CSQ_IDX_ALT = 16;
const MIN_TOKENS_ALT = 17;

function parsePositionBasedFieldsAlternate(
  tokens: string[],
  empty: IStartekParsed,
  deviceId: string | null
): void {
  if (tokens.length < MIN_TOKENS_ALT) return;
  const cmd = empty.msgType ?? '';
  if (!PT60_CMD_POSITION_PARSED.includes(cmd as (typeof PT60_CMD_POSITION_PARSED)[number])) return;
  const timeToken = tokens[DATE_TIME_IDX + 1];
  if (!timeToken || !/^\d{12}$/.test(timeToken)) return;
  const fixFlag = tokens[FIX_IDX_ALT];
  if (fixFlag !== 'A' && fixFlag !== 'V') return;
  const lat = parseFloat(tokens[LAT_IDX_ALT]);
  const lon = parseFloat(tokens[LON_IDX_ALT]);
  if (isNaN(lat) || isNaN(lon)) return;
  const latParsed = parseLatLon(lat, false);
  const lonParsed = parseLatLon(lon, true);
  if (latParsed < -90 || latParsed > 90 || lonParsed < -180 || lonParsed > 180) return;
  const speedKmh = parseFloat(tokens[SPEED_IDX_ALT]);
  const courseDeg = parseFloat(tokens[COURSE_IDX_ALT]);
  const satQuantity = parseInt(tokens[SAT_QUANTITY_IDX_ALT], 10);
  const hdop = parseFloat(tokens[HDOP_IDX_ALT]);
  const csqRaw = parseInt(tokens[CSQ_IDX_ALT], 10);
  const gpsFixValid = fixFlag === 'A';
  empty.gpsValid = gpsFixValid;
  empty.latitude = latParsed;
  empty.longitude = lonParsed;
  if (!isNaN(speedKmh) && speedKmh >= 0 && speedKmh <= 500) empty.speedKph = speedKmh;
  if (!isNaN(courseDeg) && courseDeg >= 0 && courseDeg <= 360) empty.courseDeg = courseDeg;
  const satsNum = isNaN(satQuantity) ? 0 : Math.max(0, Math.min(20, satQuantity));
  const hdopNum = isNaN(hdop) ? 0 : hdop;
  const connectivity = computeSatelliteConnectivity(gpsFixValid, satsNum, hdopNum);
  const gsmCsq = isNaN(csqRaw) ? 99 : Math.max(0, Math.min(99, csqRaw));
  const gsmPercent = gsmCsq >= 0 && gsmCsq <= 31 ? Math.round((gsmCsq / 31) * 100) : null;
  const gsmQuality = gsmQualityLabel(gsmCsq);
  const signal: SignalExtra = {
    gps: {
      fix_flag: fixFlag,
      valid: gpsFixValid,
      sats: satsNum,
      hdop: hdopNum,
      speed_kmh: isNaN(speedKmh) ? 0 : speedKmh,
      course_deg: isNaN(courseDeg) ? 0 : courseDeg,
      has_signal: gpsFixValid && satsNum >= 3,
      connectivity,
    },
    gsm: {
      csq: gsmCsq,
      percent: gsmPercent,
      quality: gsmQuality,
    },
  };
  empty.extra.signal = signal;
}

// --- Parsed message type ---

export type IStartekParsed = {
  deviceId: string | null;
  msgType: string | null;
  eventCode: string | null;
  gpsTimeUtc: string | null;
  gpsTimeLocal: string | null;
  timezone: string;
  gpsValid: boolean | null;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  courseDeg: number | null;
  batteryVoltageV: number | null;
  batteryPercent: number | null;
  packetLength: number | null;
  extra: Record<string, unknown>;
  rawPayload: string;
};

export function parseIStartekLine(rawLine: string): IStartekParsed {
  const empty: IStartekParsed = {
    deviceId: null,
    msgType: null,
    eventCode: null,
    gpsTimeUtc: null,
    gpsTimeLocal: null,
    timezone: DEVICE_TIMEZONE,
    gpsValid: null,
    latitude: null,
    longitude: null,
    speedKph: null,
    courseDeg: null,
    batteryVoltageV: null,
    batteryPercent: null,
    packetLength: null,
    extra: { tokens: [], parseError: null },
    rawPayload: rawLine.trim(),
  };

  const norm = normalizeLine(rawLine);
  if (!norm) {
    empty.extra.parseError = 'invalid_prefix';
    return empty;
  }

  const { tokens, packetLength, rawPayload } = norm;
  empty.extra.tokens = tokens;
  empty.packetLength = packetLength;

  try {
    // deviceId: first token matching 12–20 digits
    const imeiMatch = tokens.find((t) => /^\d{12,20}$/.test(t));
    if (imeiMatch) empty.deviceId = imeiMatch;

    // msgType: exactly 3 digits e.g. "000"
    const msgTypeMatch = tokens.find((t) => /^\d{3}$/.test(t));
    if (msgTypeMatch) empty.msgType = msgTypeMatch;

    // eventCode: small int after msgType (e.g. "0")
    const msgIdx = tokens.indexOf(empty.msgType ?? '');
    if (msgIdx >= 0 && tokens[msgIdx + 1] !== undefined && /^\d+$/.test(tokens[msgIdx + 1])) {
      empty.eventCode = tokens[msgIdx + 1];
    }

    // gps time: 12 digits DDMMYYHHMMSS
    const timeToken = tokens.find((t) => t.length === 12 && /^\d{12}$/.test(t));
    if (timeToken) {
      empty.gpsTimeUtc = parseGpsTimeUtc(timeToken);
      if (empty.gpsTimeUtc) {
        const utc = DateTime.fromISO(empty.gpsTimeUtc, { zone: 'utc' });
        const local = utc.setZone(DEVICE_TIMEZONE);
        const localIso = local.toISO();
        empty.gpsTimeLocal = localIso ?? empty.gpsTimeLocal;
        if (!empty.extra.time) empty.extra.time = {};
        (empty.extra.time as Record<string, string | null>).gps_time_local = empty.gpsTimeLocal;
        (empty.extra.time as Record<string, string>).timezone = DEVICE_TIMEZONE;
      }
    }

    // Protocol v2.2 position-based parse for cmd 000/010/020 (exact field order)
    parsePositionBasedFields(tokens, empty, empty.deviceId);
    if (empty.extra.signal == null) {
      parsePositionBasedFieldsAlternate(tokens, empty, empty.deviceId);
    }
    const usedPositionBased = empty.extra.signal != null;

    if (!usedPositionBased) {
      // gps valid: "A" or "V" => true (per spec) – heuristic when not position-based
      const validToken = tokens.find((t) => t === 'A' || t === 'V');
      if (validToken !== undefined) empty.gpsValid = validToken === 'A';

      // latitude / longitude: two consecutive floats in valid range; prefer decimal-degree tokens
      let latLonFound = false;
      for (let i = 0; i < tokens.length - 1; i++) {
        const a = parseFloat(tokens[i]);
        const b = parseFloat(tokens[i + 1]);
        if (isNaN(a) || isNaN(b)) continue;
        const lat = parseLatLon(a, false);
        const lon = parseLatLon(b, true);
        if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
          const hasDecimal = tokens[i].includes('.') || tokens[i + 1].includes('.');
          if (hasDecimal || !latLonFound) {
            empty.latitude = lat;
            empty.longitude = lon;
            if (tokens[i + 2] !== undefined) {
              const sp = parseFloat(tokens[i + 2]);
              if (!isNaN(sp) && sp >= 0 && sp <= 500) empty.speedKph = sp;
            }
            if (tokens[i + 3] !== undefined) {
              const crs = parseFloat(tokens[i + 3]);
              if (!isNaN(crs) && crs >= 0 && crs <= 360) empty.courseDeg = crs;
            }
            if (hasDecimal) break;
            latLonFound = true;
          }
        }
      }
    }

    // PT60-L system-sta: 8-hex-digit string (e.g. in token "505|2|D070|0152CF42"). Bit5=stop, Bit2=GPS, Bit3=ext power.
    let systemStaHex: string | null = null;
    for (const t of tokens) {
      if (/^[0-9A-Fa-f]{8}$/.test(t)) {
        systemStaHex = t;
        break;
      }
      if (t.includes('|')) {
        const segment = t.split('|').find((s) => /^[0-9A-Fa-f]{8}$/.test(s));
        if (segment) {
          systemStaHex = segment;
          break;
        }
      }
    }
    if (systemStaHex) {
      const systemStaInt = parseInt(systemStaHex, 16);
      if (!Number.isNaN(systemStaInt)) {
        const is_stopped = ((systemStaInt >> 5) & 1) === 1;
        const gps_status_bit = ((systemStaInt >> 2) & 1) === 1;
        const ext_power_connected = ((systemStaInt >> 3) & 1) === 1;
        empty.extra.pt60_state = {
          system_sta: systemStaInt,
          is_stopped,
          gps_status_bit,
          ext_power_connected,
        };
      }
    }

    // gps_lock from fix_flag (A = locked, V = not locked)
    if (empty.extra.signal != null && typeof (empty.extra.signal as { gps?: { fix_flag?: string } }).gps?.fix_flag === 'string') {
      empty.extra.gps_lock = (empty.extra.signal as { gps: { fix_flag: string } }).gps.fix_flag === 'A';
    } else if (empty.gpsValid != null) {
      empty.extra.gps_lock = empty.gpsValid;
    }

    // Battery (iStartek Protocol v2.2): ext-V|bat-V in LAST comma-separated token.
    // tailToken e.g. "0000|019AE4" => extV_hex=0000, batV_hex=019A (first 4 after pipe), checksum_hex=E4 (last 2). V*100 in hex.
    const tailToken = tokens.length > 0 ? tokens[tokens.length - 1] : '';
    let batteryVoltageV: number | null = null;
    let extVoltageV: number | null = null;
    let batV_hex: string | null = null;
    let extV_hex: string | null = null;
    let checksum_hex: string | null = null;

    if (tailToken.includes('|')) {
      const [extPart, rightPart] = tailToken.split('|');
      extV_hex = (extPart ?? '').trim();
      const right = (rightPart ?? '').trim().replace(/\s/g, '');
      const isHex = (s: string) => /^[0-9A-Fa-f]+$/.test(s);
      if (right.length >= 6 && isHex(right)) {
        batV_hex = right.slice(0, 4);
        checksum_hex = right.slice(-2);
      } else if (right.length === 4 && isHex(right)) {
        batV_hex = right;
      }
      if (batV_hex != null) {
        const batV100 = parseInt(batV_hex, 16);
        if (!isNaN(batV100)) batteryVoltageV = Math.round((batV100 / 100) * 100) / 100;
      }
      if (extV_hex && extV_hex !== '0000' && isHex(extV_hex)) {
        const extV100 = parseInt(extV_hex, 16);
        if (!isNaN(extV100)) extVoltageV = Math.round((extV100 / 100) * 100) / 100;
      }
    }

    empty.extra.power = {
      ext_voltage_v: extVoltageV ?? undefined,
      battery_voltage_v: batteryVoltageV ?? undefined,
      bat_hex: batV_hex ?? undefined,
      ext_hex: extV_hex ?? undefined,
      checksum_hex: checksum_hex ?? undefined,
      source: 'tailToken_extV_batV',
    };

    if (batteryVoltageV != null) {
      empty.batteryVoltageV = batteryVoltageV;
      empty.batteryPercent = Math.max(0, Math.min(100, voltageToPercent(batteryVoltageV)));
      empty.extra.internal_battery_voltage_v = batteryVoltageV;
      empty.extra.battery = {
        voltage_v: batteryVoltageV,
        percent: empty.batteryPercent,
        curve: 'pt60_curve_v1',
      };
    }

    // Normalized wired/power fields for UI and APIs (RG-WF1 and other wired trackers).
    // external_power_connected: from pt60 system_sta bit 3, or inferred from ext voltage when present.
    // acc_status: can be set when packet exposes ACC/ignition (e.g. system_sta bit or dedicated token); leave null until mapped.
    const pt60State = empty.extra.pt60_state as { ext_power_connected?: boolean } | undefined;
    const extFromBit = pt60State?.ext_power_connected === true || pt60State?.ext_power_connected === false;
    empty.extra.wired_power = {
      external_power_connected: extFromBit ? pt60State!.ext_power_connected : (extVoltageV != null && extVoltageV > 5 ? true : null),
      acc_status: null as 'on' | 'off' | null,
      backup_battery_voltage_v: batteryVoltageV ?? null,
      backup_battery_percent: empty.batteryPercent ?? null,
    };
  } catch (e) {
    empty.extra.parseError = String(e);
  }

  return empty;
}

// --- Legacy shape for existing insert (Supabase) ---

export type ParsedLocation = {
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

export function parsePT60Line(line: string): ParsedLocation | null {
  const raw = line.trim();
  if (!raw.startsWith('&&')) return null;
  const parsed = parseIStartekLine(raw);
  if (!parsed.deviceId) return null;
  return {
    device_id: parsed.deviceId,
    gps_time: parsed.gpsTimeUtc,
    gps_valid: parsed.gpsValid,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    speed_kph: parsed.speedKph,
    course_deg: parsed.courseDeg,
    event_code: parsed.eventCode,
    raw_payload: parsed.rawPayload,
    extra: parsed.extra,
  };
}
