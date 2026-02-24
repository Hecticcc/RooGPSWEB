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

function toDecimalDegrees(ddmm: number, isLongitude: boolean): number {
  const sign = ddmm < 0 ? -1 : 1;
  const abs = Math.abs(ddmm);
  const deg = Math.floor(abs / 100);
  const min = abs - deg * 100;
  const decimal = sign * (deg + min / 60);
  return Math.round(decimal * 1e6) / 1e6;
}

function parseTime(s: string): string | null {
  if (!s || typeof s !== 'string') return null;
  const t = s.trim();
  if (t.length === 12 && /^\d{12}$/.test(t)) {
    const yy = parseInt(t.slice(0, 2), 10);
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    const month = parseInt(t.slice(2, 4), 10) - 1;
    const day = parseInt(t.slice(4, 6), 10);
    const hour = parseInt(t.slice(6, 8), 10);
    const min = parseInt(t.slice(8, 10), 10);
    const sec = parseInt(t.slice(10, 12), 10);
    const d = new Date(year, month, day, hour, min, sec);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (t.length >= 14 && /^\d{14}/.test(t)) {
    const year = parseInt(t.slice(0, 4), 10);
    const month = parseInt(t.slice(4, 6), 10) - 1;
    const day = parseInt(t.slice(6, 8), 10);
    const hour = parseInt(t.slice(8, 10), 10);
    const min = parseInt(t.slice(10, 12), 10);
    const sec = parseInt(t.slice(12, 14), 10);
    const d = new Date(year, month, day, hour, min, sec);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const iso = Date.parse(t);
  if (!isNaN(iso)) return new Date(iso).toISOString();
  return null;
}

export function parsePT60Line(line: string): ParsedLocation | null {
  const raw = line.trim();
  if (!raw.startsWith('&&')) return null;
  const body = raw.slice(2);
  const tokens = body.split(',').map((s) => s.trim());
  const extra: Record<string, unknown> = { tokens };
  let device_id = '';
  let gps_time: string | null = null;
  let gps_valid: boolean | null = null;
  let latitude: number | null = null;
  let longitude: number | null = null;
  let speed_kph: number | null = null;
  let course_deg: number | null = null;
  let event_code: string | null = null;
  if (tokens.length > 0) {
    device_id = tokens[0];
    // Some devices send prefix as first field (e.g. ":120") and IMEI as second (e.g. "867747070319866")
    const looksLikeImei = (s: string) => /^\d{10,20}$/.test(s) && !s.includes(':');
    if (!looksLikeImei(device_id) && tokens.length > 1 && looksLikeImei(tokens[1])) {
      device_id = tokens[1];
    }
  }
  const validIdx = tokens.findIndex((t) => t === 'A' || t === 'V');
  if (validIdx >= 0) gps_valid = tokens[validIdx] === 'A';
  if (tokens.length > 1 && /^\d{12}$/.test(tokens[1])) gps_time = parseTime(tokens[1]);
  if (!gps_time && tokens.some((t) => t.length >= 12 && /^\d+$/.test(t))) {
    const t = tokens.find((x) => x.length === 12 && /^\d{12}$/.test(x)) ?? tokens.find((x) => x.length >= 14 && /^\d{14}/.test(x));
    if (t) gps_time = parseTime(t);
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const num = parseFloat(t);
    if (t === 'N' || t === 'S') {
      const prev = parseFloat(tokens[i - 1]);
      if (!isNaN(prev) && latitude === null) {
        const dec = Math.abs(prev) > 90 ? toDecimalDegrees(prev, false) : prev;
        latitude = t === 'S' ? -Math.abs(dec) : Math.abs(dec);
      }
    }
    if (t === 'E' || t === 'W') {
      const prev = parseFloat(tokens[i - 1]);
      if (!isNaN(prev) && longitude === null) {
        const dec = Math.abs(prev) > 180 ? toDecimalDegrees(prev, true) : prev;
        longitude = t === 'W' ? -Math.abs(dec) : Math.abs(dec);
      }
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const num = parseFloat(t);
    if (t.length >= 10 && /^\d+$/.test(t) && !gps_time) gps_time = parseTime(t);
    if (!isNaN(num) && latitude === null && Math.abs(num) <= 9000 && (Math.abs(num) > 90 || (t.includes('.') && num >= 0))) {
      const next = tokens[i + 1];
      if (next === 'N' || next === 'S') continue;
      latitude = Math.abs(num) > 90 ? toDecimalDegrees(num, false) : num;
    }
    if (!isNaN(num) && longitude === null && Math.abs(num) <= 18000 && (Math.abs(num) > 180 || (t.includes('.') && num >= 0))) {
      const next = tokens[i + 1];
      if (next === 'E' || next === 'W') continue;
      longitude = Math.abs(num) > 180 ? toDecimalDegrees(num, true) : num;
    }
    if (!isNaN(num) && num >= 0 && num <= 360 && speed_kph === null && i > 2 && tokens[i - 1] && !isNaN(parseFloat(tokens[i - 1])) && parseFloat(tokens[i - 1]) < 200) {
      speed_kph = parseFloat(tokens[i - 1]);
      course_deg = num;
    }
  }
  const latIdx = tokens.findIndex((t) => {
    const n = parseFloat(t);
    return !isNaN(n) && (Math.abs(n) <= 90 || (Math.abs(n) > 90 && Math.abs(n) <= 9000));
  });
  const lonIdx = tokens.findIndex((t, i) => {
    if (i <= latIdx && latIdx >= 0) return false;
    const n = parseFloat(t);
    return !isNaN(n) && (Math.abs(n) <= 180 || (Math.abs(n) > 180 && Math.abs(n) <= 18000));
  });
  if (latIdx >= 0 && latitude === null) {
    const n = parseFloat(tokens[latIdx]);
    latitude = Math.abs(n) > 90 ? toDecimalDegrees(n, false) : n;
  }
  if (lonIdx >= 0 && longitude === null) {
    const n = parseFloat(tokens[lonIdx]);
    longitude = Math.abs(n) > 180 ? toDecimalDegrees(n, true) : n;
  }
  if (speed_kph === null) {
    const speedCandidates = tokens.map((t, i) => ({ i, n: parseFloat(t) })).filter(({ n }) => !isNaN(n) && n >= 0 && n <= 500 && n < 200);
    const afterLon = lonIdx >= 0 ? speedCandidates.filter(({ i }) => i > lonIdx) : speedCandidates;
    if (afterLon.length > 0) speed_kph = afterLon[0].n;
  }
  if (course_deg === null && speed_kph !== null) {
    const speedIdx = tokens.findIndex((t) => parseFloat(t) === speed_kph);
    if (speedIdx >= 0 && tokens[speedIdx + 1] !== undefined) course_deg = parseFloat(tokens[speedIdx + 1]) ?? null;
  }
  if (event_code === null && tokens.length > 5) event_code = tokens[tokens.length - 1] || null;
  return {
    device_id,
    gps_time,
    gps_valid,
    latitude,
    longitude,
    speed_kph,
    course_deg,
    event_code,
    raw_payload: raw,
    extra,
  };
}
