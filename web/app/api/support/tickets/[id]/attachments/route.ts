import { NextResponse } from 'next/server';
import { getSupportAuth, getServiceRoleClient } from '../../../auth';
import { SUPPORT_ATTACHMENT_MAX_SIZE_BYTES, SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES } from '@/lib/support/constants';

export const dynamic = 'force-dynamic';

/** POST /api/support/tickets/[id]/attachments – create attachment record (file already uploaded to Storage by client). */
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

  const { data: ticket } = await admin.from('support_tickets').select('id, user_id').eq('id', ticketId).single();
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isOwner = (ticket as { user_id: string }).user_id === auth.userId;
  if (!auth.isStaff && !isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { storage_path: string; file_name: string; mime_type?: string; file_size?: number; message_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storage_path = typeof body.storage_path === 'string' ? body.storage_path.trim() : '';
  const file_name = typeof body.file_name === 'string' ? body.file_name.trim() : '';
  if (!storage_path || !file_name) return NextResponse.json({ error: 'storage_path and file_name required' }, { status: 400 });

  const file_size = typeof body.file_size === 'number' ? body.file_size : null;
  if (file_size != null && file_size > SUPPORT_ATTACHMENT_MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File too large' }, { status: 400 });
  }

  const mime_type = body.mime_type && typeof body.mime_type === 'string' ? body.mime_type : null;
  if (mime_type && !SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES.includes(mime_type as typeof SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES[number])) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
  }

  const message_id = body.message_id ?? null;

  const { data: att, error } = await admin
    .from('support_ticket_attachments')
    .insert({
      ticket_id: ticketId,
      message_id: message_id || null,
      storage_path,
      file_name,
      mime_type: mime_type || null,
      file_size: file_size ?? null,
      uploaded_by: auth.userId,
    })
    .select('id, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from('support_ticket_activity').insert({
    ticket_id: ticketId,
    action: 'attachment_uploaded',
    actor_user_id: auth.userId,
    new_value: file_name,
  });

  return NextResponse.json({ attachment: { id: att.id, created_at: att.created_at } });
}
