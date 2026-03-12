import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

const AU_TZ = 'Australia/Sydney';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-AU', {
      timeZone: AU_TZ,
      dateStyle: 'short',
      timeStyle: 'medium',
    });
  } catch {
    return iso;
  }
}

function escapeCsvField(v: unknown): string {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function rowToCsvLine(loc: {
  gps_time: string | null;
  received_at: string;
  latitude: number | null;
  longitude: number | null;
  speed_kph: number | null;
  gps_valid: boolean | null;
  raw_payload: string;
  extra: Record<string, unknown> | null;
}): string {
  const extra = (loc.extra ?? {}) as {
    battery?: { percent?: number; voltage_v?: number };
    power?: { bat_hex?: string };
  };
  const fields = [
    formatDate(loc.received_at),
    formatDate(loc.gps_time),
    loc.latitude ?? '',
    loc.longitude ?? '',
    loc.speed_kph ?? '',
    loc.gps_valid == null ? '' : loc.gps_valid ? 'Y' : 'N',
    extra.battery?.percent ?? '',
    extra.battery?.voltage_v != null ? String(extra.battery.voltage_v) : '',
    extra.power?.bat_hex ?? '',
    loc.raw_payload,
  ];
  return fields.map(escapeCsvField).join(',');
}

/**
 * GET /api/admin/devices/[id]/export-csv
 * Streams a CSV of all location rows for the device directly from the DB.
 * Optional query params:
 *   from=YYYY-MM-DD  start date (inclusive, based on received_at, Australia/Sydney)
 *   to=YYYY-MM-DD    end date  (inclusive, based on received_at, Australia/Sydney)
 *
 * Returns the file as a streaming download — one DB round-trip per 2000-row batch,
 * no client-side pagination loops needed.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) {
    return new Response(JSON.stringify(guard.body), {
      status: guard.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id: deviceId } = await params;
  if (!deviceId) {
    return new Response(JSON.stringify({ error: 'Device ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Date range params (YYYY-MM-DD in Sydney time → UTC bounds)
  const url = new URL(request.url);
  const fromParam = url.searchParams.get('from')?.trim();
  const toParam = url.searchParams.get('to')?.trim();

  // Convert a YYYY-MM-DD date in Sydney time to UTC ISO bounds
  function sydneyDayToUtc(dateStr: string, endOfDay: boolean): string | null {
    try {
      // Build a Date object for midnight Sydney time on that date
      // We approximate Sydney UTC offset: AEDT (+11) Oct–Apr, AEST (+10) otherwise
      const [y, m, d] = dateStr.split('-').map(Number);
      if (!y || !m || !d) return null;
      // Use Intl to find Sydney midnight in UTC
      const candidate = new Date(`${dateStr}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+11:00`);
      // Adjust for AEST/AEDT by checking actual Sydney offset
      const fmt = new Intl.DateTimeFormat('en-AU', {
        timeZone: AU_TZ,
        hour: 'numeric',
        hour12: false,
        timeZoneName: 'short',
      });
      const parts = fmt.formatToParts(candidate);
      const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
      const offset = tzName.includes('11') ? 11 : 10;
      const baseIso = `${dateStr}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`;
      const sign = -1; // Sydney is ahead of UTC
      const utcMs = new Date(baseIso).getTime() + sign * offset * 60 * 60 * 1000;
      return new Date(utcMs).toISOString();
    } catch {
      return null;
    }
  }

  const fromIso = fromParam ? sydneyDayToUtc(fromParam, false) : null;
  const toIso = toParam ? sydneyDayToUtc(toParam, true) : null;

  // Build a filename that reflects the range
  const filenameParts = [`payloads-${deviceId}`];
  if (fromParam) filenameParts.push(`from-${fromParam}`);
  if (toParam) filenameParts.push(`to-${toParam}`);
  if (!fromParam && !toParam) filenameParts.push('all');
  const filename = `${filenameParts.join('_')}.csv`;

  const BATCH = 2000;
  const encoder = new TextEncoder();
  const CSV_HEADER = 'Received (AU),GPS time,Lat,Lon,Speed,GPS valid,Battery %,Battery V,bat_hex,Raw\r\n';

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(CSV_HEADER));

        let offset = 0;
        while (true) {
          let query = admin
            .from('locations')
            .select('gps_time, received_at, latitude, longitude, speed_kph, gps_valid, raw_payload, extra')
            .eq('device_id', deviceId)
            .order('received_at', { ascending: false })
            .range(offset, offset + BATCH - 1);

          if (fromIso) query = query.gte('received_at', fromIso);
          if (toIso) query = query.lte('received_at', toIso);

          const { data, error } = await query;
          if (error) {
            controller.enqueue(encoder.encode(`\r\n# Error: ${error.message}\r\n`));
            break;
          }
          if (!data || data.length === 0) break;

          const lines = data
            .map((loc) =>
              rowToCsvLine(loc as Parameters<typeof rowToCsvLine>[0])
            )
            .join('\r\n');
          controller.enqueue(encoder.encode(lines + '\r\n'));

          if (data.length < BATCH) break;
          offset += BATCH;
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-store',
    },
  });
}
