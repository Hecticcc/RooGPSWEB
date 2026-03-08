import { NextResponse } from 'next/server';
import { renderEmailPreview } from '@/lib/email/emailDispatcher';
import { getMockPayload } from '@/lib/email/mockPayloads';
import { EMAIL_EVENTS, type EmailEventName } from '@/lib/email/emailEvents';

export const dynamic = 'force-dynamic';

const EVENT_NAMES = Object.values(EMAIL_EVENTS) as EmailEventName[];

/**
 * GET /api/email-preview?event=ticket.created.customer
 * Renders the email template for the given event with mock data.
 * Intended for local development. In production, returns 404.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const event = searchParams.get('event')?.trim();
  if (!event) {
    const list = EVENT_NAMES.map((e) => `<li><a href="?event=${encodeURIComponent(e)}">${e}</a></li>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Email previews</title></head><body><h1>RooGPS email previews</h1><ul>${list}</ul></body></html>`;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  if (!EVENT_NAMES.includes(event as EmailEventName)) {
    return NextResponse.json({ error: `Unknown event: ${event}` }, { status: 400 });
  }

  const payload = getMockPayload(event as EmailEventName);
  const body = await renderEmailPreview(event as EmailEventName, payload);
  return new NextResponse(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
