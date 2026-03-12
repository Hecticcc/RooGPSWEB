import { NextResponse } from 'next/server';
import { recordEmailSent } from '@/lib/email/idempotency';

const ALLOWED_EVENTS = new Set([
  'account.password_reset',
  'account.email_verification',
  'account.created',
]);

const SUBJECTS: Record<string, string> = {
  'account.password_reset': 'Reset your RooGPS password',
  'account.email_verification': 'Verify your email — RooGPS',
  'account.created': 'Welcome to RooGPS',
};

/**
 * POST /api/auth/record-email
 * Called client-side after Supabase Auth sends a transactional email (password reset, etc.)
 * so that it appears in the admin "Emails sent" log.
 *
 * Public endpoint (no auth required) — only records a breadcrumb log entry.
 * Idempotency prevents duplicate entries for the same email+event within a day.
 * Only a fixed allowlist of event names is accepted.
 */
export async function POST(request: Request) {
  let body: { recipient_email?: string; event_name?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = typeof body.recipient_email === 'string' ? body.recipient_email.trim().toLowerCase() : '';
  const event = typeof body.event_name === 'string' ? body.event_name.trim() : '';

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'recipient_email required' }, { status: 400 });
  }
  if (!ALLOWED_EVENTS.has(event)) {
    return NextResponse.json({ error: 'Invalid event_name' }, { status: 400 });
  }

  // Idempotency key scoped to the day so re-sends within 24 h show up but
  // multiple duplicate calls (e.g. double-click) don't create extra entries.
  const day = new Date().toISOString().slice(0, 10);
  const idempotencyKey = `${event}:${email}:${day}`;
  const subject = SUBJECTS[event] ?? event;

  await recordEmailSent(event, idempotencyKey, email, subject, null);

  return NextResponse.json({ ok: true });
}
