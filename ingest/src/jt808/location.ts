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
  // altitude 2, speed 2, direction 2, time 6
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
    extra: {
      jt808: true,
      alarm,
      status,
    },
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
