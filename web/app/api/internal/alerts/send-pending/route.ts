import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { sendSms, SMS_MONTHLY_LIMIT } from '@/lib/smsportal';

const CRON_SECRET = process.env.CRON_SECRET ?? process.env.INTERNAL_TRIPS_SECRET ?? '';

function authInternal(request: Request): boolean {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ') && auth.slice(7) === CRON_SECRET) return true;
  if (request.headers.get('x-internal-secret') === CRON_SECRET) return true;
  return false;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * POST – Process unsent device_alert_events (WatchDog, etc.) and send SMS.
 * Call this from cron every 1–2 minutes (e.g. CRON_SECRET in Authorization header).
 * Checks: sms_alerts_enabled, profile.mobile, monthly limit. Marks events with sms_sent_at.
 */
export async function POST(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json(
      { error: 'Set CRON_SECRET for alerts send-pending' },
      { status: 503 }
    );
  }
  if (!authInternal(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const period = currentPeriod();
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  // Smaller batch to avoid OOM in Supabase pg_net/cron when calling this endpoint
  const batchSize = 20;

  const { data: events, error: eventsErr } = await admin
    .from('device_alert_events')
    .select('id, device_id, user_id, alert_type, payload, created_at')
    .is('sms_sent_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (eventsErr || !events?.length) {
    return NextResponse.json({ processed: 0, sent: 0, error: eventsErr?.message ?? null });
  }

  const deviceIds = Array.from(new Set(events.map((e) => e.device_id).filter(Boolean)));
  const deviceNameById: Record<string, string> = {};
  if (deviceIds.length > 0) {
    const { data: devices } = await admin
      .from('devices')
      .select('id, name')
      .in('id', deviceIds);
    for (const d of devices ?? []) {
      deviceNameById[d.id] = (d.name && d.name.trim()) ? d.name.trim() : d.id;
    }
  }

  const trackerLabel = (deviceId: string) => {
    const name = deviceNameById[deviceId] ?? deviceId;
    const short = name.length > 20 ? name.slice(0, 17) + '...' : name;
    return short;
  };

  let sent = 0;
  for (const ev of events) {
    const [profileRes, settingsRes, usageRes] = await Promise.all([
      admin.from('profiles').select('mobile').eq('user_id', ev.user_id).maybeSingle(),
      admin.from('alert_settings').select('sms_alerts_enabled').eq('user_id', ev.user_id).maybeSingle(),
      admin.from('sms_usage').select('count').eq('user_id', ev.user_id).eq('period', period).maybeSingle(),
    ]);

    const mobile = profileRes.data?.mobile?.trim();
    const enabled = settingsRes.data?.sms_alerts_enabled === true;
    const used = usageRes.data?.count ?? 0;

    if (!enabled || !mobile || used >= SMS_MONTHLY_LIMIT) {
      await admin.from('device_alert_events').update({ sms_sent_at: new Date().toISOString() }).eq('id', ev.id);
      continue;
    }

    if (ev.alert_type === 'geofence') {
      const p = (ev.payload as { alert_sms?: boolean }) ?? {};
      if (p.alert_sms !== true) {
        await admin.from('device_alert_events').update({ sms_sent_at: new Date().toISOString() }).eq('id', ev.id);
        continue;
      }
    }
    if (ev.alert_type === 'battery') {
      const p = (ev.payload as { alert_sms?: boolean }) ?? {};
      if (p.alert_sms !== true) {
        await admin.from('device_alert_events').update({ sms_sent_at: new Date().toISOString() }).eq('id', ev.id);
        continue;
      }
    }

    const tracker = trackerLabel(ev.device_id);
    let message: string;
    if (ev.alert_type === 'watchdog') {
      const p = (ev.payload as { speed_kph?: number; distance_m?: number }) ?? {};
      const speed = p.speed_kph != null ? Math.round(p.speed_kph) : 0;
      const dist = p.distance_m != null ? Math.round(p.distance_m) : 0;
      message = `RooGPS [${tracker}] WatchDog: Your tracker moved. Speed: ${speed} km/h, distance: ${dist} m. Check your dashboard.`;
    } else if (ev.alert_type === 'night_guard') {
      message = `RooGPS [${tracker}] Night Guard: Your tracker left the zone. Check your dashboard.`;
    } else if (ev.alert_type === 'geofence') {
      const p = (ev.payload as { geofence_type?: string; name?: string }) ?? {};
      const zoneType = p.geofence_type === 'keep_out' ? 'Keep out' : 'Keep in';
      const name = p.name ? ` (${String(p.name).slice(0, 20)})` : '';
      message = `RooGPS [${tracker}]: ${zoneType} zone${name} – tracker alert. Check your dashboard.`;
    } else if (ev.alert_type === 'battery') {
      const p = (ev.payload as { threshold_percent?: number }) ?? {};
      const pct = p.threshold_percent != null ? p.threshold_percent : 20;
      message = `RooGPS [${tracker}]: Tracker battery is below ${pct}%. Check your dashboard.`;
    } else {
      message = `RooGPS [${tracker}]: Alert (${ev.alert_type}). Check your dashboard.`;
    }

    const result = await sendSms(mobile, message);
    if (!result.ok) {
      continue;
    }

    await admin.from('device_alert_events').update({ sms_sent_at: new Date().toISOString() }).eq('id', ev.id);
    await admin.rpc('increment_sms_usage_internal', { p_user_id: ev.user_id, p_period: period });
    sent++;
  }

  return NextResponse.json({ processed: events.length, sent });
}
