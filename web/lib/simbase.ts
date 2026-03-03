/**
 * Simbase API v2 – list SIM cards (GET /simcards).
 * Ref: https://developer.simbase.com/#tag/sim-cards/get/simcards
 */

const SIMBASE_API_BASE = process.env.SIMBASE_API_URL ?? 'https://api.simbase.com/v2';
const SIMBASE_SIMS_PATH = process.env.SIMBASE_SIMS_PATH ?? '/simcards';
const SIMBASE_API_KEY = process.env.SIMBASE_API_KEY ?? '';

export type SimbaseSim = {
  iccid: string;
  state: string;
  raw: Record<string, unknown>;
};

function getState(sim: Record<string, unknown>): string {
  const s = String(sim.state ?? sim.status ?? '').toLowerCase().trim();
  if (s === 'enabled' || s === 'active') return 'enabled';
  if (s === 'disabled' || s === 'inactive') return 'disabled';
  return s || 'unknown';
}

function getIccid(sim: Record<string, unknown>): string {
  return String(sim.iccid ?? sim.id ?? '').trim();
}

/** Extract list of SIMs from Simbase API response (handles multiple response shapes). */
function parseSimcardsResponse(data: unknown): { simcards: Record<string, unknown>[]; nextCursor: string | null } {
  const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  let list: unknown[] = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (Array.isArray(obj.simcards)) {
    list = obj.simcards;
  } else if (Array.isArray(obj.data)) {
    list = obj.data;
  } else if (obj.data && typeof obj.data === 'object' && Array.isArray((obj.data as Record<string, unknown>).simcards)) {
    list = (obj.data as Record<string, unknown>).simcards as unknown[];
  } else if (Array.isArray(obj.results)) {
    list = obj.results;
  } else if (Array.isArray(obj.items)) {
    list = obj.items;
  }
  const simcards = list.filter((s) => s && typeof s === 'object') as Record<string, unknown>[];
  const nextCursor =
    typeof obj.cursor === 'string'
      ? obj.cursor
      : typeof obj.next_cursor === 'string'
        ? obj.next_cursor
        : typeof obj.nextCursor === 'string'
          ? obj.nextCursor
          : null;
  return { simcards, nextCursor };
}

/**
 * List all SIM cards from Simbase API (GET /simcards with cursor pagination).
 * Returns array of { iccid, state, raw }. Returns [] if API key missing or on error.
 */
export async function listSimbaseSimcards(): Promise<SimbaseSim[]> {
  if (!SIMBASE_API_KEY) return [];
  const base = SIMBASE_API_BASE.replace(/\/$/, '');
  const path = SIMBASE_SIMS_PATH.startsWith('/') ? SIMBASE_SIMS_PATH : `/${SIMBASE_SIMS_PATH}`;
  const headers: HeadersInit = {
    Authorization: `Bearer ${SIMBASE_API_KEY}`,
    'Content-Type': 'application/json',
  };
  const all: SimbaseSim[] = [];
  let cursor: string | null = null;
  let page = 0;
  const maxPages = 100;
  do {
    const url = new URL(base + path);
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Simbase API ${res.status}: ${text.slice(0, 200)}`);
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error('Invalid JSON from Simbase');
    }
    const { simcards: pageList, nextCursor: next } = parseSimcardsResponse(data);
    for (const sim of pageList) {
      const iccid = getIccid(sim);
      if (iccid) {
        all.push({
          iccid,
          state: getState(sim),
          raw: { ...sim },
        });
      }
    }
    cursor = next;
    page++;
  } while (cursor && page < maxPages);
  return all;
}

/**
 * Set SIM state in Simbase (POST /simcards/{iccid}/state).
 * Used when a customer activates their device so the SIM is enabled for data.
 */
export async function setSimbaseSimState(
  iccid: string,
  state: 'enabled' | 'disabled'
): Promise<{ ok: boolean; error?: string }> {
  if (!SIMBASE_API_KEY) return { ok: false, error: 'Simbase not configured' };
  const base = SIMBASE_API_BASE.replace(/\/$/, '');
  const url = `${base}/simcards/${encodeURIComponent(iccid)}/state`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SIMBASE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    if (res.ok || res.status === 202) return { ok: true };
    return { ok: false, error: `Simbase ${res.status}: ${text.slice(0, 200)}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// --- Simbase SMS: Send and List (per Simbase API docs) ---

/**
 * Send SMS to a SIM card (POST /simcards/{iccid}/sms).
 * Requires scope simcards.sms:send.
 * Body: { message } (1–180 chars). Returns 202 Accepted on success.
 */
export async function sendSimbaseSms(
  iccid: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  if (!SIMBASE_API_KEY) {
    return { ok: false, error: 'Simbase not configured' };
  }
  const trimmed = String(message ?? '').trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Message required' };
  }
  if (trimmed.length > 180) {
    return { ok: false, error: 'Message max 180 characters' };
  }
  const base = SIMBASE_API_BASE.replace(/\/$/, '');
  const path = `/simcards/${encodeURIComponent(iccid)}/sms`;
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SIMBASE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: trimmed }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    if (res.status === 202) {
      return { ok: true };
    }
    if (res.status === 400) return { ok: false, error: 'Validation error' };
    if (res.status === 482) return { ok: false, error: 'Insufficient balance' };
    if (res.status === 484) return { ok: false, error: 'Not found' };
    return { ok: false, error: `Simbase ${res.status}: ${text.slice(0, 200)}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export type SimbaseSmsItem = {
  direction: 'mt' | 'mo';
  message: string;
  status: string;
  timestamp: string;
};

export type ListSimbaseSmsOptions = {
  direction?: 'mt' | 'mo';
  day?: string;
  limit?: number;
  cursor?: string | null;
};

/**
 * List SMS messages for a SIM card (GET /simcards/{iccid}/sms).
 * Requires scope simcards.sms:read.
 * Results ordered by most recent first; paginated via cursor.
 */
export async function listSimbaseSms(
  iccid: string,
  options: ListSimbaseSmsOptions = {}
): Promise<{ sms: SimbaseSmsItem[]; cursor: string | null; has_more: boolean; count: number }> {
  const { direction, day, limit = 100, cursor: cursorIn = null } = options;
  if (!SIMBASE_API_KEY) {
    return { sms: [], cursor: null, has_more: false, count: 0 };
  }
  const base = SIMBASE_API_BASE.replace(/\/$/, '');
  const path = `/simcards/${encodeURIComponent(iccid)}/sms`;
  const url = new URL(`${base}${path}`);
  if (direction) url.searchParams.set('direction', direction);
  if (day) url.searchParams.set('day', day);
  url.searchParams.set('limit', String(Math.min(250, Math.max(1, limit ?? 100))));
  if (cursorIn) url.searchParams.set('cursor', cursorIn);

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${SIMBASE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    if (!res.ok) {
      return { sms: [], cursor: null, has_more: false, count: 0 };
    }
    let data: Record<string, unknown>;
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return { sms: [], cursor: null, has_more: false, count: 0 };
    }
    const list = (Array.isArray(data.sms) ? data.sms : Array.isArray(data.sns) ? data.sns : []) as Array<Record<string, unknown>>;
    const sms: SimbaseSmsItem[] = list.map((item) => ({
      direction: (String(item.direction ?? 'mt').toLowerCase() === 'mo' ? 'mo' : 'mt') as 'mt' | 'mo',
      message: String(item.message ?? ''),
      status: String(item.status ?? ''),
      timestamp: String(item.timestamp ?? ''),
    }));
    const nextCursor = typeof data.cursor === 'string' ? data.cursor : null;
    const has_more = Boolean(data.has_more);
    const count = typeof data.count === 'number' ? data.count : sms.length;
    return { sms, cursor: nextCursor, has_more, count };
  } catch {
    return { sms: [], cursor: null, has_more: false, count: 0 };
  }
}
