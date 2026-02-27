import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

const INGEST_HEALTH_URL = process.env.INGEST_HEALTH_URL ?? '';

const ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 min
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Admin API requires SUPABASE_SERVICE_ROLE_KEY in server environment (see .env.local or deployment env)' },
      { status: 503 }
    );
  }

  const now = new Date();
  const since24h = new Date(now.getTime() - ONE_DAY_MS).toISOString();
  const onlineCutoff = new Date(now.getTime() - ONLINE_THRESHOLD_MS).toISOString();

  const [
    usersCountRes,
    devicesRes,
    locationsCountRes,
    lastLocationRes,
    trackerStockCountRes,
    newOrders24hRes,
    ordersByStatusRes,
    revenueRes,
  ] = await Promise.all([
    admin.from('user_roles').select('*', { count: 'exact', head: true }),
    admin.from('devices').select('id, last_seen_at'),
    admin.from('locations').select('*', { count: 'exact', head: true }).gte('received_at', since24h),
    admin.from('locations').select('received_at').order('received_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('tracker_stock').select('*', { count: 'exact', head: true }),
    admin.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', since24h),
    admin.from('orders').select('status'),
    admin.from('orders').select('total_cents').in('status', ['paid', 'fulfilled', 'processing', 'shipped', 'activated']),
  ]);

  const totalUsers = (usersCountRes as { count?: number })?.count ?? 0;
  const devices = devicesRes.data ?? [];
  const totalDevices = devices.length;
  const onlineDevices = devices.filter((d) => d.last_seen_at && d.last_seen_at >= onlineCutoff).length;
  const offlineDevices = totalDevices - onlineDevices;
  const locationsLast24h = (locationsCountRes as { count?: number })?.count ?? 0;

  let deadletterCount: number | null = null;
  let ingestHealth: { status?: string; uptime_seconds?: number; last_error?: string; last_error_at?: string; deadletter_writes?: number } | null = null;
  let ingestError: string | null = null;

  if (INGEST_HEALTH_URL) {
    try {
      const res = await fetch(INGEST_HEALTH_URL, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      ingestHealth = {
        status: data.status,
        uptime_seconds: data.uptime_seconds,
        last_error: data.last_error ?? undefined,
        last_error_at: data.last_error_at ?? undefined,
        deadletter_writes: data.deadletter_writes,
      };
      deadletterCount = data.deadletter_writes ?? null;
    } catch (e) {
      ingestError = e instanceof Error ? e.message : 'Failed to fetch ingest health';
    }
  }

  const lastLocationReceivedAt = (lastLocationRes.data as { received_at?: string } | null)?.received_at ?? null;
  const tracker_stock_count = (trackerStockCountRes as { count?: number })?.count ?? 0;

  const new_orders_24h = (newOrders24hRes as { count?: number })?.count ?? 0;
  const ordersByStatus = (ordersByStatusRes.data ?? []) as { status: string }[];
  const total_orders_incomplete = ordersByStatus.filter((o) => !['activated', 'cancelled'].includes(o.status)).length;
  const completed_orders = ordersByStatus.filter((o) => o.status === 'activated').length;
  const revenueCents = (revenueRes.data ?? []) as { total_cents: number | null }[];
  const revenue = revenueCents.reduce((sum, o) => sum + (o.total_cents ?? 0), 0);

  return NextResponse.json({
    total_users: totalUsers,
    total_devices: totalDevices,
    online_devices: onlineDevices,
    offline_devices: offlineDevices,
    locations_last_24h: locationsLast24h,
    deadletter_count: deadletterCount,
    ingest_health: ingestHealth,
    ingest_error: ingestError,
    ingest_started_at: ingestHealth?.uptime_seconds != null ? new Date(Date.now() - ingestHealth.uptime_seconds * 1000).toISOString() : null,
    last_location_received_at: lastLocationReceivedAt,
    tracker_stock_count,
    new_orders_24h,
    total_orders_incomplete,
    completed_orders,
    revenue_cents: revenue,
  });
}
