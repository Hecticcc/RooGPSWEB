/**
 * Parse tracker SMS reply bodies for commands 800 (live location) and 802 (work status).
 * Store in device_command_jobs.reply_parsed.
 */

export type Parsed800 = {
  type: '800';
  gps: { fix_flag: string | null; speed_kmh: number | null };
  gsm: { csq: number | null };
  battery: { percent: number | null };
  map: { url: string | null };
};

export type Parsed802 = {
  type: '802';
  gsm: { csq: number | null };
  gps: { sats: number | null };
  power: { battery_v: number | null; external_v: number | null };
};

export type ReplyParsed = Parsed800 | Parsed802;

function extractNum(s: string, re: RegExp): number | null {
  const m = s.match(re);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

function extractStr(s: string, re: RegExp): string | null {
  const m = s.match(re);
  return m ? m[1].trim() : null;
}

/** Parse 800 (live location) reply */
export function parseReply800(raw: string): Parsed800 {
  const s = raw.trim();
  const fixFlag = extractStr(s, /fix[:\s]*([AV])/i) ?? extractStr(s, /([AV])[,;\s]/);
  const speedKmh = extractNum(s, /speed[:\s]*([\d.]+)/i) ?? extractNum(s, /([\d.]+)\s*km\/h/i);
  const csq = extractNum(s, /csq[:\s]*(\d+)/i) ?? extractNum(s, /(?:gsm|signal)[:\s]*(\d+)/i);
  const batteryPercent = extractNum(s, /batt(?:ery)?[:\s]*(\d+)/i) ?? extractNum(s, /(\d+)\s*%/);
  const mapUrl = extractStr(s, /(https?:\/\/[^\s]+)/) ?? extractStr(s, /(maps\.google[^\s]*)/);
  return {
    type: '800',
    gps: { fix_flag: fixFlag ?? null, speed_kmh: speedKmh },
    gsm: { csq: csq ?? null },
    battery: { percent: batteryPercent ?? null },
    map: { url: mapUrl ?? null },
  };
}

/** Parse 802 (work status) reply */
export function parseReply802(raw: string): Parsed802 {
  const s = raw.trim();
  const csq = extractNum(s, /csq[:\s]*(\d+)/i) ?? extractNum(s, /(?:gsm|signal)[:\s]*(\d+)/i);
  const sats = extractNum(s, /sat(?:ellite)?s?[:\s]*(\d+)/i) ?? extractNum(s, /gps[:\s]*(\d+)/i);
  const batteryV = extractNum(s, /(?:internal\s+)?batt(?:ery)?[:\s]*([\d.]+)\s*v/i) ?? extractNum(s, /batt[:\s]*([\d.]+)/i);
  const externalV = extractNum(s, /(?:external|ext)[:\s]*([\d.]+)\s*v/i) ?? extractNum(s, /ext[:\s]*([\d.]+)/i);
  return {
    type: '802',
    gsm: { csq: csq ?? null },
    gps: { sats: sats ?? null },
    power: { battery_v: batteryV ?? null, external_v: externalV ?? null },
  };
}

/** Parsed config query reply (808,102 / 808,124 / 808,122): current value string e.g. "102,120,,600". */
export type Parsed808Config = {
  type: '808_config';
  /** Full config line e.g. "102,120,,600" or "124,1,180". */
  config_line: string;
  /** Command code (102, 124, or 122). */
  code: number;
};

/** Parse config query reply (808) - tracker may echo config line like "102,120,,600". */
export function parseReply808Config(raw: string, commandName: string): Parsed808Config | null {
  const s = raw.trim();
  if (!s) return null;
  const lower = commandName.toLowerCase();
  const code102 = lower.includes('102') ? 102 : null;
  const code124 = lower.includes('124') ? 124 : null;
  const code122 = lower.includes('122') ? 122 : null;
  const code = code102 ?? code124 ?? code122;
  if (code == null) return null;
  const match = s.match(new RegExp(`(?:^|\\s)(${code},[^\\s]+)`));
  if (match) {
    return { type: '808_config', config_line: match[1]!, code };
  }
  if (/^\d+,[\d,]*$/.test(s)) {
    const first = parseInt(s.split(',')[0]!, 10);
    if (first === code) return { type: '808_config', config_line: s, code };
  }
  return null;
}

/** Parse reply_raw by command type */
export function parseReply(raw: string, commandName: string): ReplyParsed | Parsed808Config | null {
  const s = raw.trim();
  if (!s) return null;
  const lower = commandName.toLowerCase();
  if (lower.includes('808') || lower.includes('query') || lower.includes('102') || lower.includes('124') || lower.includes('122')) {
    const config = parseReply808Config(s, commandName);
    if (config) return config;
  }
  if (lower.includes('800') || lower.includes('live location')) return parseReply800(s);
  if (lower.includes('802') || lower.includes('work status')) return parseReply802(s);
  if (/fix[:\s]*[AV]|speed[:\s]*[\d.]|maps\.google|google\.com\/maps/i.test(s)) return parseReply800(s);
  if (/csq|sat(?:ellite)?s?|batt(?:ery)?[:\s]*[\d.]|external/i.test(s)) return parseReply802(s);
  return null;
}
