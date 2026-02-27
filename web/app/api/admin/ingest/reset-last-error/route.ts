import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/admin-auth';

const INGEST_HEALTH_URL = process.env.INGEST_HEALTH_URL ?? '';

function resetLastErrorUrl(): string {
  if (!INGEST_HEALTH_URL) return '';
  const u = new URL(INGEST_HEALTH_URL);
  u.pathname = '/reset-last-error';
  return u.toString();
}

export async function POST(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const url = resetLastErrorUrl();
  if (!url) {
    return NextResponse.json({ error: 'INGEST_HEALTH_URL not configured' }, { status: 503 });
  }
  try {
    const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(5000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error ?? `Ingest returned ${res.status}` }, { status: 502 });
    }
    // Ingest must return { ok: true }; old versions return health JSON for unknown paths
    if (data?.ok !== true) {
      return NextResponse.json(
        { error: 'Ingest service does not support reset. Restart the ingest process to enable "Reset last error".' },
        { status: 502 }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to reset';
    return NextResponse.json(
      { error: `Ingest unreachable: ${message}` },
      { status: 502 }
    );
  }
}
