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

    // gps valid: "A" or "V" => true (per spec)
    const validToken = tokens.find((t) => t === 'A' || t === 'V');
    if (validToken !== undefined) empty.gpsValid = true;

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
      empty.extra.battery = {
        voltage_v: batteryVoltageV,
        percent: empty.batteryPercent,
        curve: 'pt60_curve_v1',
      };
    }
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
