import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/admin-auth';

const SIMBASE_API_BASE = process.env.SIMBASE_API_URL ?? 'https://api.simbase.com/v2';
const SIMBASE_API_KEY = process.env.SIMBASE_API_KEY ?? '';

/**
 * PATCH /api/admin/stock/simcards/[iccid] – update SIM state via Simbase API.
 * Body: { state: "enabled" | "disabled" }
 * Simbase: POST /simcards/{iccid}/state with body { state: "enabled" | "disabled" }, returns 202 Accepted.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ iccid: string }> }
) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  if (!SIMBASE_API_KEY) {
    return NextResponse.json(
      { error: 'SIMBASE_API_KEY not configured.' },
      { status: 503 }
    );
  }
  const { iccid } = await params;
  if (!iccid) {
    return NextResponse.json({ error: 'ICCID required' }, { status: 400 });
  }
  let body: { state?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const state = body.state === 'enabled' ? 'enabled' : body.state === 'disabled' ? 'disabled' : null;
  if (!state) {
    return NextResponse.json({ error: 'state must be "enabled" or "disabled"' }, { status: 400 });
  }
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
    if (!res.ok) {
      return NextResponse.json(
        { error: `Simbase API error: ${res.status}`, detail: text.slice(0, 500) },
        { status: 502 }
      );
    }
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // empty or non-JSON success response
      }
    }
    return NextResponse.json({ ok: true, state, sim: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Failed to update SIM state: ${message}` }, { status: 502 });
  }
}
