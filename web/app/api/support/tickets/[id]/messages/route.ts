import { NextResponse } from 'next/server';
import { getSupportAuth, getServiceRoleClient } from '../../../auth';
import { scheduleEmailEvent } from '@/lib/email/emailDispatcher';
import { EMAIL_EVENTS } from '@/lib/email/emailEvents';
import { getEmailForUserId, getStaffNotificationEmails } from '@/lib/email/getRecipients';

export const dynamic = 'force-dynamic';

/** POST /api/support/tickets/[id]/messages – add reply or internal note. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getSupportAuth(request);
  if (!authResult.ok) return authResult.response;
  const { auth } = authResult;
  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { id: ticketId } = await params;
  if (!ticketId) return NextResponse.json({ error: 'Ticket ID required' }, { status: 400 });

  const { data: ticket } = await admin
    .from('support_tickets')
    .select('id, user_id, status, ticket_number, subject, priority, category')
    .eq('id', ticketId)
    .single();
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isOwner = (ticket as { user_id: string }).user_id === auth.userId;
  if (!auth.isStaff && !isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { body: string; is_internal?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messageBody = typeof body.body === 'string' ? body.body.trim() : '';
  if (!messageBody) return NextResponse.json({ error: 'Message body is required' }, { status: 400 });

  const isInternal = auth.isStaff && body.is_internal === true;

  const { data: message, error: msgErr } = await admin
    .from('support_ticket_messages')
    .insert({
      ticket_id: ticketId,
      sender_type: auth.isStaff ? 'staff' : 'customer',
      sender_user_id: auth.userId,
      body: messageBody,
      is_internal: isInternal,
    })
    .select('id, created_at')
    .single();

  if (msgErr || !message) return NextResponse.json({ error: msgErr?.message ?? 'Failed to add message' }, { status: 500 });

  const now = new Date().toISOString();
  const currentStatus = (ticket as { status: string }).status;
  const isActive = currentStatus !== 'resolved' && currentStatus !== 'closed';
  const lastReplyUpdate: Record<string, unknown> = { last_reply_at: now, updated_at: now };
  if (!isInternal) {
    if (auth.isStaff) {
      lastReplyUpdate.last_staff_reply_at = now;
      if (isActive) lastReplyUpdate.status = 'answered';
    } else {
      lastReplyUpdate.last_customer_reply_at = now;
      if (isActive) lastReplyUpdate.status = 'open';
    }
  }
  await admin.from('support_tickets').update(lastReplyUpdate).eq('id', ticketId);

  await admin.from('support_ticket_activity').insert({
    ticket_id: ticketId,
    action: isInternal ? 'note_added' : 'reply_added',
    actor_user_id: auth.userId,
    message_id: message.id,
  });

  // Transactional emails (fire-and-forget); skip for internal notes
  if (!isInternal) {
    const t = ticket as { ticket_number?: string; subject?: string; priority?: string; category?: string };
    const replyPreview = messageBody.length > 200 ? messageBody.slice(0, 197) + '...' : messageBody;
    const basePayload = {
      ticketId,
      ticketNumber: t.ticket_number ?? `#${ticketId}`,
      subject: t.subject ?? 'Support request',
      status: currentStatus,
      priority: t.priority ?? 'medium',
      category: t.category ?? 'general',
      replyPreview,
      idempotencyKey: `reply:${ticketId}:${message.id}`,
    };
    if (auth.isStaff) {
      const customerEmail = await getEmailForUserId((ticket as { user_id: string }).user_id);
      if (customerEmail) {
        scheduleEmailEvent(EMAIL_EVENTS.TICKET_REPLY_CUSTOMER, { ...basePayload, recipientEmail: customerEmail });
      }
    } else {
      const staffEmails = await getStaffNotificationEmails();
      const customerEmail = await getEmailForUserId(auth.userId);
      for (const email of staffEmails) {
        if (email === customerEmail) continue;
        scheduleEmailEvent(EMAIL_EVENTS.TICKET_REPLY_STAFF, { ...basePayload, recipientEmail: email });
      }
    }
  }

  return NextResponse.json({ message: { id: message.id, created_at: message.created_at } });
}
