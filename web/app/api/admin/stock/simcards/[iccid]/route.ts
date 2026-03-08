import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/admin-auth';
import { setSimbaseSimState, updateSimbaseSimTags, tagsForSimState } from '@/lib/simbase';

const SIMBASE_API_KEY = process.env.SIMBASE_API_KEY ?? '';

/**
 * PATCH /api/admin/stock/simcards/[iccid] – update SIM state (and optionally tags) via Simbase API.
 * Body: { state: "enabled" | "disabled", tags?: string[] }
 * When tags are provided, tag is synced: disabled → "Suspended", enabled → "Assigned".
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
  let body: { state?: string; tags?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const state = body.state === 'enabled' ? 'enabled' : body.state === 'disabled' ? 'disabled' : null;
  if (!state) {
    return NextResponse.json({ error: 'state must be "enabled" or "disabled"' }, { status: 400 });
  }
  try {
    const stateResult = await setSimbaseSimState(iccid, state);
    if (!stateResult.ok) {
      return NextResponse.json(
        { error: stateResult.error ?? 'Failed to update SIM state' },
        { status: 502 }
      );
    }
    const currentTags = Array.isArray(body.tags) ? body.tags : [];
    const newTags = tagsForSimState(currentTags, state);
    const tagResult = await updateSimbaseSimTags(iccid, newTags);
    if (!tagResult.ok) {
      return NextResponse.json(
        { ok: true, state, tagError: tagResult.error, message: 'State updated; tag sync failed.' },
        { status: 200 }
      );
    }
    return NextResponse.json({ ok: true, state, tags: newTags });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Failed to update SIM: ${message}` }, { status: 502 });
  }
}
