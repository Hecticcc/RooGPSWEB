import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/admin-auth';

const INGEST_HEALTH_URL = process.env.INGEST_HEALTH_URL ?? '';

export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  if (!INGEST_HEALTH_URL) {
    return NextResponse.json({ error: 'INGEST_HEALTH_URL not configured' }, { status: 503 });
  }
  try {
    const res = await fetch(INGEST_HEALTH_URL, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to fetch';
    return NextResponse.json(
      { error: `Ingest unreachable: ${message}. Check INGEST_HEALTH_URL and that the ingest service is running.` },
      { status: 502 }
    );
  }
}
