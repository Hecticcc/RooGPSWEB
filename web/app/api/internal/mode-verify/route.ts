/**
 * Cron: run staggered mode verification for devices in VERIFYING state.
 * Call every 20–30s (e.g. CRON_SECRET in Authorization or x-internal-secret header).
 */

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { runScheduledVerifications } from '@/lib/mode-transition';

const CRON_SECRET = process.env.CRON_SECRET ?? process.env.INTERNAL_TRIPS_SECRET ?? '';

function authInternal(request: Request): boolean {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ') && auth.slice(7) === CRON_SECRET) return true;
  if (request.headers.get('x-internal-secret') === CRON_SECRET) return true;
  return false;
}

export async function POST(request: Request) {
  if (!CRON_SECRET || !authInternal(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const count = await runScheduledVerifications(admin);
  return NextResponse.json({ ok: true, verified_count: count });
}
