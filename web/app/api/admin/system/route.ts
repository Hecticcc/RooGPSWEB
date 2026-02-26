import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

const INGEST_HEALTH_URL = process.env.INGEST_HEALTH_URL ?? '';

export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { data: settings } = await admin.from('system_settings').select('*').eq('id', 'default').single();

  let ingestStatus = 'not_configured';
  let ingestUptimeSeconds: number | null = null;
  if (INGEST_HEALTH_URL) {
    try {
      const res = await fetch(INGEST_HEALTH_URL, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      ingestStatus = data.status ?? 'unknown';
      ingestUptimeSeconds = data.uptime_seconds ?? null;
    } catch {
      ingestStatus = 'unreachable';
    }
  }

  return NextResponse.json({
    supabase_connected: !!admin,
    ingest_health_url_configured: !!INGEST_HEALTH_URL,
    ingest_status: ingestStatus,
    ingest_uptime_seconds: ingestUptimeSeconds,
    maintenance_mode: settings?.maintenance_mode ?? false,
    ingest_accept: settings?.ingest_accept ?? true,
    app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    git_commit: process.env.GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    environment: process.env.NODE_ENV ?? 'development',
  });
}

export async function PATCH(request: Request) {
  const guard = await requireRole(request, 'administrator');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  let body: { maintenance_mode?: boolean; ingest_accept?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: { maintenance_mode?: boolean; ingest_accept?: boolean; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.maintenance_mode === 'boolean') updates.maintenance_mode = body.maintenance_mode;
  if (typeof body.ingest_accept === 'boolean') updates.ingest_accept = body.ingest_accept;

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { error } = await admin.from('system_settings').update(updates).eq('id', 'default');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
