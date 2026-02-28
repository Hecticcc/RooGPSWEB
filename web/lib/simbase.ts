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
