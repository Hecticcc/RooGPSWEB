import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/admin-auth';
import { sendSms } from '@/lib/smsportal';

/**
 * POST /api/admin/sms/test
 * Admin-only: send a test SMS to a given number. Does not count against user usage.
 * Body: { to: string, message: string }
 */
export async function POST(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }

  let body: { to?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const to = typeof body.to === 'string' ? body.to.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!to) {
    return NextResponse.json({ error: 'Missing or empty "to" (phone number)' }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: 'Missing or empty "message"' }, { status: 400 });
  }

  const result = await sendSms(to, message);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'Failed to send SMS' },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
