import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

const SIMBASE_API_BASE = process.env.SIMBASE_API_URL ?? 'https://api.simbase.com/v2';
const SIMBASE_SIMS_PATH = process.env.SIMBASE_SIMS_PATH ?? '/simcards';
const SIMBASE_API_KEY = process.env.SIMBASE_API_KEY ?? '';

/**
 * Proxy to Simbase API to list SIM cards. API key must be set in env (SIMBASE_API_KEY).
 * Ref: https://developer.simbase.com/ / https://support.simbase.com/the-developer/api
 */
export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  if (!SIMBASE_API_KEY) {
    return NextResponse.json(
      { error: 'SIMBASE_API_KEY not configured. Add it in environment variables.' },
      { status: 503 }
    );
  }
  try {
    const base = SIMBASE_API_BASE.replace(/\/$/, '');
    const path = SIMBASE_SIMS_PATH.startsWith('/') ? SIMBASE_SIMS_PATH : `/${SIMBASE_SIMS_PATH}`;
    const headers: HeadersInit = {
      Authorization: `Bearer ${SIMBASE_API_KEY}`,
      'Content-Type': 'application/json',
    };
    const allSims: unknown[] = [];
    let cursor: string | null = null;
    const maxPages = 100;
    let page = 0;
    do {
      const url = new URL(base + path);
      if (cursor) url.searchParams.set('cursor', cursor);
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      if (!res.ok) {
        return NextResponse.json(
          { error: `Simbase API error: ${res.status}`, detail: text.slice(0, 500) },
          { status: 502 }
        );
      }
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        return NextResponse.json({ error: 'Invalid JSON from Simbase API', raw: text.slice(0, 300) }, { status: 502 });
      }
      const obj = data as { simcards?: unknown[]; cursor?: string | null };
      const pageList = Array.isArray(data) ? data : (obj.simcards ?? []);
      allSims.push(...pageList);
      cursor = obj.cursor ?? null;
      page++;
    } while (cursor && page < maxPages);

    const iccids = allSims.map((s) => String((s as { iccid?: string; id?: string }).iccid ?? (s as { id?: string }).id ?? '')).filter(Boolean);
    let assignments: { iccid: string; order_number: string | null; email: string | null }[] = [];
    if (iccids.length > 0) {
      const admin = createServiceRoleClient();
      if (admin) {
        const rpc = await admin.rpc('get_sim_order_assignments', { iccids });
        assignments = (rpc.data ?? []) as { iccid: string; order_number: string | null; email: string | null }[];
      }
    }
    const assignmentByIccid = new Map(assignments.map((a) => [a.iccid, { order_number: a.order_number ?? null, email: a.email ?? null }]));
    const simcardsWithAssignment = allSims.map((sim) => {
      const s = sim as { iccid?: string; id?: string };
      const iccid = String(s.iccid ?? s.id ?? '');
      const a = assignmentByIccid.get(iccid);
      const base = typeof sim === 'object' && sim !== null ? (sim as Record<string, unknown>) : {};
      return { ...base, order_number: a?.order_number ?? null, email: a?.email ?? null };
    });
    return NextResponse.json({ simcards: simcardsWithAssignment, total: simcardsWithAssignment.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Failed to fetch Simbase SIMs: ${message}` }, { status: 502 });
  }
}
