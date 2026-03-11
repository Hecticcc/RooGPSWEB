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

  const s = settings as Record<string, unknown> | null;

  // Ingest server usage (last 24h): count locations by ingest_server so admin can see which server is getting traffic
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: locRows } = await admin
    .from('locations')
    .select('ingest_server')
    .gte('received_at', since24h)
    .limit(10000);
  const ingest_server_usage_24h: Record<string, number> = {};
  for (const row of locRows ?? []) {
    const server = (row as { ingest_server?: string | null }).ingest_server ?? '(none)';
    ingest_server_usage_24h[server] = (ingest_server_usage_24h[server] ?? 0) + 1;
  }

  return NextResponse.json({
    supabase_connected: !!admin,
    ingest_health_url_configured: !!INGEST_HEALTH_URL,
    ingest_status: ingestStatus,
    ingest_uptime_seconds: ingestUptimeSeconds,
    ingest_server_usage_24h,
    maintenance_mode: s?.maintenance_mode ?? false,
    ingest_accept: s?.ingest_accept ?? true,
    login_disabled: s?.login_disabled ?? false,
    stripe_trial_enabled: s?.stripe_trial_enabled ?? false,
    stripe_trial_default_months: s?.stripe_trial_default_months ?? null,
    stripe_trial_updated_at: s?.stripe_trial_updated_at ?? null,
    stripe_trial_updated_by: s?.stripe_trial_updated_by ?? null,
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

  let body: {
    maintenance_mode?: boolean;
    ingest_accept?: boolean;
    login_disabled?: boolean;
    stripe_trial_enabled?: boolean;
    stripe_trial_default_months?: number | null;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: {
    maintenance_mode?: boolean;
    ingest_accept?: boolean;
    login_disabled?: boolean;
    stripe_trial_enabled?: boolean;
    stripe_trial_default_months?: number | null;
    stripe_trial_updated_at?: string;
    stripe_trial_updated_by?: string | null;
    updated_at: string;
  } = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.maintenance_mode === 'boolean') updates.maintenance_mode = body.maintenance_mode;
  if (typeof body.ingest_accept === 'boolean') updates.ingest_accept = body.ingest_accept;
  if (typeof body.login_disabled === 'boolean') updates.login_disabled = body.login_disabled;

  if (typeof body.stripe_trial_enabled === 'boolean') {
    updates.stripe_trial_enabled = body.stripe_trial_enabled;
    updates.stripe_trial_updated_at = new Date().toISOString();
    updates.stripe_trial_updated_by = guard.user.id;
  }
  if (body.stripe_trial_default_months !== undefined) {
    const months = body.stripe_trial_default_months;
    if (months !== null && (typeof months !== 'number' || months < 0 || months > 24)) {
      return NextResponse.json({ error: 'stripe_trial_default_months must be 0–24 or null' }, { status: 400 });
    }
    updates.stripe_trial_default_months = months;
    updates.stripe_trial_updated_at = new Date().toISOString();
    updates.stripe_trial_updated_by = guard.user.id;
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { error } = await admin.from('system_settings').update(updates).eq('id', 'default');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
