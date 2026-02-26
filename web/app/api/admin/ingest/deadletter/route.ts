import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/admin-auth';

const INGEST_HEALTH_URL = process.env.INGEST_HEALTH_URL ?? '';

function deadletterUrl(): string {
  if (!INGEST_HEALTH_URL) return '';
  const u = new URL(INGEST_HEALTH_URL);
  u.pathname = '/deadletter';
  return u.toString();
}

export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const url = deadletterUrl();
  if (!url) {
    return NextResponse.json({ error: 'INGEST_HEALTH_URL not configured' }, { status: 503 });
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    if (data.error) {
      return NextResponse.json({ error: data.error }, { status: 502 });
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch deadletter' },
      { status: 502 }
    );
  }
}
