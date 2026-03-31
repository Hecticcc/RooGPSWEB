import type { ParsedLocationLike } from '../location-pipeline';

/** BCD 6 bytes YY MM DD hh mm ss → ISO UTC string */
export function parseBcdTime(buf: Buffer, offset: number): string | null {
  if (buf.length < offset + 6) return null;
  const yy = bcdByte(buf[offset]);
  const mm = bcdByte(buf[offset + 1]);
  const dd = bcdByte(buf[offset + 2]);
  const hh = bcdByte(buf[offset + 3]);
  const mi = bcdByte(buf[offset + 4]);
  const ss = bcdByte(buf[offset + 5]);
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  const d = new Date(Date.UTC(year, mm - 1, dd, hh, mi, ss));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function bcdByte(b: number): number {
  return ((b >> 4) & 0x0f) * 10 + (b & 0x0f);
}

/** Vendor supplemental IDs (GAT24 / similar manuals): length-prefixed records inside 0xEB block. */
export const JT808_VENDOR_FIELD_VOLTAGE_PERCENT = 0x00a8;
export const JT808_VENDOR_FIELD_EXTERNAL_VOLTAGE_MV = 0x002d;
/** IMEI as ASCII (15 digits); manual lists 0x00D5 / 0x0011 depending on row */
export const JT808_VENDOR_FIELD_IMEI_ASCII = 0x00d5;
export const JT808_VENDOR_FIELD_IMEI_ASCII_ALT = 0x0011;

export type Jt808VendorPower = {
  /** One byte: hex value equals percentage (e.g. 0x55 → 85%). */
  voltage_percent: number | null;
  /** External supply in millivolts (uint16 BE). */
  external_voltage_mv: number | null;
  /** Full IMEI when present in extension. */
  imei_ascii: string | null;
};

/**
 * Inner structure: [uint16 BE total length][uint16 BE field id][payload…].
 * Parsed from the value of JT808 additional id 0xEB.
 */
export function parseVendorEbPowerRecords(buf: Buffer): Jt808VendorPower {
  const out: Jt808VendorPower = {
    voltage_percent: null,
    external_voltage_mv: null,
    imei_ascii: null,
  };
  let o = 0;
  while (o + 2 <= buf.length) {
    const reclen = buf.readUInt16BE(o);
    o += 2;
    if (reclen < 2 || o + reclen > buf.length) break;
    const rec = buf.subarray(o, o + reclen);
    o += reclen;
    const fieldType = rec.readUInt16BE(0);
    const payload = rec.subarray(2);
    if (fieldType === JT808_VENDOR_FIELD_VOLTAGE_PERCENT && payload.length >= 1) {
      const p = payload[0] ?? 0;
      out.voltage_percent = Math.min(100, p);
    } else if (fieldType === JT808_VENDOR_FIELD_EXTERNAL_VOLTAGE_MV && payload.length >= 2) {
      out.external_voltage_mv = payload.readUInt16BE(0);
    } else if (
      (fieldType === JT808_VENDOR_FIELD_IMEI_ASCII || fieldType === JT808_VENDOR_FIELD_IMEI_ASCII_ALT) &&
      payload.length >= 15
    ) {
      const s = payload.subarray(0, 15).toString('ascii').replace(/\0/g, '').trim();
      if (/^\d{15}$/.test(s)) out.imei_ascii = s;
    }
  }
  return out;
}

/**
 * JT808 0x0200 additional information: id (1) + len (1) + value (len).
 * When id === 0xEB, value is parsed with {@link parseVendorEbPowerRecords}.
 */
export function parseJt808AdditionalInfo(body: Buffer, startOffset: number): {
  mileage_raw?: number;
  gsm_signal?: number;
  gnss_sat_count?: number;
  vendor_power: Jt808VendorPower | null;
} {
  const result: {
    mileage_raw?: number;
    gsm_signal?: number;
    gnss_sat_count?: number;
    vendor_power: Jt808VendorPower | null;
  } = { vendor_power: null };
  let o = startOffset;
  while (o + 2 <= body.length) {
    const id = body[o++];
    const len = body[o++];
    if (o + len > body.length) break;
    const val = body.subarray(o, o + len);
    o += len;
    if (id === 0x01 && len === 4) result.mileage_raw = val.readUInt32BE(0);
    else if (id === 0x30 && len >= 1) result.gsm_signal = val[0];
    else if (id === 0x31 && len >= 1) result.gnss_sat_count = val[0];
    else if (id === 0xeb && len >= 2) result.vendor_power = parseVendorEbPowerRecords(val);
  }
  return result;
}

/**
 * JT808 0x0200 / 0x0201 location body (base 28+ bytes; may have extensions).
 * @see JT/T 808-2011 § location information reporting
 */
export function parseLocationBody(
  body: Buffer,
  deviceId: string,
  rawHex: string
): ParsedLocationLike | null {
  if (body.length < 28) return null;
  let o = 0;
  const alarm = body.readUInt32BE(o);
  o += 4;
  const status = body.readUInt32BE(o);
  o += 4;
  const latRaw = body.readUInt32BE(o);
  o += 4;
  const lonRaw = body.readUInt32BE(o);
  o += 4;
  const altitudeM = body.readUInt16BE(o);
  o += 2;
  const speedRaw = body.readUInt16BE(o);
  o += 2;
  const direction = body.readUInt16BE(o);
  o += 2;
  const gpsTime = parseBcdTime(body, o);

  const south = (status & 0x04) !== 0;
  const west = (status & 0x08) !== 0;
  const latDeg = latRaw / 1_000_000;
  const lonDeg = lonRaw / 1_000_000;
  const latitude = south ? -Math.abs(latDeg) : latDeg;
  const longitude = west ? -Math.abs(lonDeg) : lonDeg;
  const gpsLocated = (status & 0x02) !== 0;
  const speedKph = speedRaw / 10;

  const extra: Record<string, unknown> = {
    jt808: true,
    alarm,
    status,
    altitude_m: altitudeM,
  };

  if (body.length > 28) {
    const add = parseJt808AdditionalInfo(body, 28);
    if (add.mileage_raw !== undefined) extra.mileage_raw = add.mileage_raw;
    if (add.gsm_signal !== undefined) extra.gsm_signal = add.gsm_signal;
    if (add.gnss_sat_count !== undefined) extra.gnss_sat_count = add.gnss_sat_count;
    if (add.vendor_power) {
      const vp = add.vendor_power;
      extra.vendor_power = vp;
      if (vp.voltage_percent != null) extra.battery_percent = vp.voltage_percent;
      if (vp.external_voltage_mv != null) {
        extra.external_voltage_mv = vp.external_voltage_mv;
        extra.external_voltage_v = Math.round((vp.external_voltage_mv / 1000) * 1000) / 1000;
      }
      if (vp.imei_ascii) extra.imei_ascii = vp.imei_ascii;
    }
  }

  return {
    device_id: deviceId,
    gps_time: gpsTime,
    gps_valid: gpsLocated,
    latitude: Math.round(latitude * 1e6) / 1e6,
    longitude: Math.round(longitude * 1e6) / 1e6,
    speed_kph: Math.round(speedKph * 10) / 10,
    course_deg: direction % 360,
    event_code: alarm !== 0 ? `0x${alarm.toString(16).padStart(8, '0')}` : null,
    raw_payload: rawHex,
    extra,
  };
}

/** Parse terminal ID from 0x0100 body (JT808-2011 register). */
export function parseRegisterTerminalId(body: Buffer): string | null {
  if (body.length < 2 + 2 + 5 + 20 + 7) return null;
  const idBuf = body.subarray(29, 36);
  const digits = [];
  for (let i = 0; i < 7; i++) {
    const b = idBuf[i] ?? 0;
    digits.push(String((b >> 4) & 0x0f), String(b & 0x0f));
  }
  const s = digits.join('').replace(/^0+/, '');
  return s || null;
}
