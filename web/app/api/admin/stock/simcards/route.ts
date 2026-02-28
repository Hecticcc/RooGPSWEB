import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';
import { listSimbaseSimcards } from '@/lib/simbase';

/**
 * Proxy to Simbase API to list SIM cards (GET /simcards). Uses shared list helper.
 * Ref: https://developer.simbase.com/#tag/sim-cards/get/simcards
 */
export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  if (!process.env.SIMBASE_API_KEY) {
    return NextResponse.json(
      { error: 'SIMBASE_API_KEY not configured. Add it in environment variables.' },
      { status: 503 }
    );
  }
  try {
    const allSims = await listSimbaseSimcards();
    const iccids = allSims.map((s) => s.iccid).filter(Boolean);
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
      const a = assignmentByIccid.get(sim.iccid);
      return {
        ...sim.raw,
        iccid: sim.iccid,
        state: (sim.raw.state ?? sim.raw.status ?? sim.state) as string,
        order_number: a?.order_number ?? null,
        email: a?.email ?? null,
      };
    });
    return NextResponse.json({ simcards: simcardsWithAssignment, total: simcardsWithAssignment.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Failed to fetch Simbase SIMs: ${message}` }, { status: 502 });
  }
}
