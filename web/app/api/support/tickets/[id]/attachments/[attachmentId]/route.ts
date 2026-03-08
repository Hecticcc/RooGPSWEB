import { NextResponse } from 'next/server';
import { getSupportAuth, getServiceRoleClient } from '../../../../auth';
import { SUPPORT_STORAGE_BUCKET } from '@/lib/support/constants';

export const dynamic = 'force-dynamic';

/** GET /api/support/tickets/[id]/attachments/[attachmentId] – signed download URL (expires in 60s). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const authResult = await getSupportAuth(request);
  if (!authResult.ok) return authResult.response;
  const { auth } = authResult;
  const { id: ticketId, attachmentId } = await params;
  if (!ticketId || !attachmentId) return NextResponse.json({ error: 'Ticket and attachment ID required' }, { status: 400 });

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const { data: attachment, error: attErr } = await admin
    .from('support_ticket_attachments')
    .select('ticket_id, storage_path')
    .eq('id', attachmentId)
    .eq('ticket_id', ticketId)
    .single();

  if (attErr || !attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: ticket } = await admin.from('support_tickets').select('user_id').eq('id', ticketId).single();
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isOwner = (ticket as { user_id: string }).user_id === auth.userId;
  if (!auth.isStaff && !isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const path = (attachment as { storage_path: string }).storage_path;
  const { data: signed, error: signErr } = await admin.storage.from(SUPPORT_STORAGE_BUCKET).createSignedUrl(path, 60);
  if (signErr) return NextResponse.json({ error: signErr.message }, { status: 500 });
  return NextResponse.json({ url: signed?.signedUrl ?? null });
}
