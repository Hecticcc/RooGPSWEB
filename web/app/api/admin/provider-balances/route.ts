import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/admin-auth';
import { getSimbaseBalance } from '@/lib/simbase';
import { getSmsportalBalance } from '@/lib/smsportal';

function parseAlertThreshold(envVal: string | undefined, fallback: number): number {
  const n = parseFloat(String(envVal ?? ''));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * GET /api/admin/provider-balances — Simbase wallet + SMSPortal credit balance (staff only).
 * Simbase: GET /account/balance (decimal string `balance`, `currency`) — key needs account:read.
 * Low-balance flags use SMSPORTAL_LOW_CREDITS_ALERT (default 200) and SIMBASE_LOW_BALANCE_ALERT (default 25).
 */
export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }

  const smsLow = parseAlertThreshold(process.env.SMSPORTAL_LOW_CREDITS_ALERT, 200);
  const simLow = parseAlertThreshold(process.env.SIMBASE_LOW_BALANCE_ALERT, 25);

  const [simbase, smsportal] = await Promise.all([getSimbaseBalance(), getSmsportalBalance()]);

  return NextResponse.json({
    simbase: {
      configured: simbase.configured,
      ok: simbase.ok,
      balance: simbase.balance,
      currency: simbase.currency ?? null,
      low: Boolean(simbase.ok && simbase.balance != null && simbase.balance < simLow),
      low_threshold: simLow,
      error: simbase.error ?? null,
    },
    smsportal: {
      configured: smsportal.configured,
      ok: smsportal.ok,
      balance: smsportal.balance,
      low: Boolean(smsportal.ok && smsportal.balance != null && smsportal.balance < smsLow),
      low_threshold: smsLow,
      unit: 'credits',
      error: smsportal.error ?? null,
    },
  });
}
