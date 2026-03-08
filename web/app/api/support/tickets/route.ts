import { NextResponse } from 'next/server';
import { getSupportAuth, getServiceRoleClient } from '../auth';
import { SUPPORT_TICKET_LIST_PAGE_SIZE, SUPPORT_TICKET_SUBJECT_MAX_LENGTH, SUPPORT_TICKET_DESCRIPTION_MAX_LENGTH } from '@/lib/support/constants';
import type { SupportTicketStatus, SupportTicketPriority, SupportCategory } from '@/lib/support/types';
import { SUPPORT_TICKET_STATUSES, SUPPORT_TICKET_PRIORITIES } from '@/lib/support/types';

const PAGE_SIZE = SUPPORT_TICKET_LIST_PAGE_SIZE;

export const dynamic = 'force-dynamic';

/** GET /api/support/tickets – list tickets (customer: own, staff: all). Paginated, filterable, sortable. */
export async function GET(request: Request) {
  const authResult = await getSupportAuth(request);
  if (!authResult.ok) return authResult.response;
  const { auth, supabase } = authResult;
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? String(PAGE_SIZE), 10) || PAGE_SIZE));
  const status = searchParams.get('status') as SupportTicketStatus | null;
  const view = searchParams.get('view') ?? 'open'; // 'open' = exclude closed/resolved; 'closed' = only closed/resolved
  const priority = searchParams.get('priority') as SupportTicketPriority | null;
  const category = searchParams.get('category') as SupportCategory | null;
  const search = searchParams.get('search')?.trim() ?? '';
  const sort = searchParams.get('sort') ?? 'updated_at';
  const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';

  let query = supabase
    .from('support_tickets')
    .select('id, ticket_number, user_id, subject, status, priority, category, source, assigned_to, created_at, updated_at, last_reply_at', { count: 'exact' });

  if (!auth.isStaff) {
    query = query.eq('user_id', auth.userId);
  }

  if (status && SUPPORT_TICKET_STATUSES.includes(status)) {
    query = query.eq('status', status);
  } else if (view === 'closed') {
    query = query.in('status', ['closed', 'resolved']);
  } else {
    query = query.not('status', 'in', '("closed","resolved")');
  }
  if (priority && SUPPORT_TICKET_PRIORITIES.includes(priority)) {
    query = query.eq('priority', priority);
  }
  if (category) {
    query = query.eq('category', category);
  }
  if (search) {
    query = query.or(`subject.ilike.%${search}%,ticket_number.ilike.%${search}%`);
  }

  const validSortColumns = ['updated_at', 'created_at', 'last_reply_at', 'priority', 'status'];
  const sortColumn = validSortColumns.includes(sort) ? sort : 'updated_at';
  query = query.order(sortColumn, { ascending: order === 'asc' });

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data: tickets, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let enrichedTickets = tickets ?? [];
  if (auth.isStaff && enrichedTickets.length > 0) {
    const admin = getServiceRoleClient();
    const ticketIds = (enrichedTickets as { id: string }[]).map((t) => t.id);
    let assignmentsByTicket: Record<string, string[]> = {};
    let nameByUserId: Record<string, string> = {};
    if (admin) {
      const { data: assignments } = await admin
        .from('support_ticket_assignments')
        .select('ticket_id, user_id')
        .in('ticket_id', ticketIds);
      for (const a of assignments ?? []) {
        const row = a as { ticket_id: string; user_id: string };
        if (!assignmentsByTicket[row.ticket_id]) assignmentsByTicket[row.ticket_id] = [];
        assignmentsByTicket[row.ticket_id].push(row.user_id);
      }
      const assignedIds = [...new Set((assignments ?? []).map((a: { user_id: string }) => a.user_id))];
      if (assignedIds.length > 0) {
        const { data: profiles } = await admin
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', assignedIds);
        nameByUserId = (profiles ?? []).reduce<Record<string, string>>((acc, p) => {
          const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Staff';
          acc[p.user_id] = name;
          return acc;
        }, {});
      }
    }
    enrichedTickets = enrichedTickets.map((t) => {
      const tid = t as { id: string; assigned_to_name?: string };
      const userIds = assignmentsByTicket[tid.id] ?? [];
      const names = userIds.map((uid) => nameByUserId[uid] ?? 'Staff').filter(Boolean);
      return { ...tid, assigned_to_name: names.length > 0 ? names.join(', ') : null };
    });
  }

  return NextResponse.json({
    tickets: enrichedTickets,
    total: count ?? 0,
    page,
    limit,
  });
}

/** POST /api/support/tickets – create ticket (customer or staff). Creates ticket + first message + activity. */
export async function POST(request: Request) {
  const authResult = await getSupportAuth(request);
  if (!authResult.ok) return authResult.response;
  const { auth } = authResult;
  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  let body: {
    subject: string;
    category?: string;
    priority?: string;
    linked_device_id?: string | null;
    linked_order_id?: string | null;
    description: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!subject || subject.length < 3) {
    return NextResponse.json({ error: 'Subject must be at least 3 characters' }, { status: 400 });
  }
  if (subject.length > SUPPORT_TICKET_SUBJECT_MAX_LENGTH) {
    return NextResponse.json({ error: `Subject must be ${SUPPORT_TICKET_SUBJECT_MAX_LENGTH} characters or fewer` }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 });
  }
  if (description.length > SUPPORT_TICKET_DESCRIPTION_MAX_LENGTH) {
    return NextResponse.json({ error: `Description must be ${SUPPORT_TICKET_DESCRIPTION_MAX_LENGTH} characters or fewer` }, { status: 400 });
  }

  const category = body.category && typeof body.category === 'string' ? body.category.trim() : 'general';
  const priority = ['low', 'medium', 'high', 'urgent'].includes(body.priority ?? '') ? body.priority : 'medium';
  const linked_device_id = body.linked_device_id ?? null;
  const linked_order_id = body.linked_order_id ?? null;

  const { data: ticket, error: ticketErr } = await admin
    .from('support_tickets')
    .insert({
      user_id: auth.userId,
      subject,
      category,
      priority,
      linked_device_id: linked_device_id || null,
      linked_order_id: linked_order_id || null,
      status: 'open',
      source: 'dashboard',
      updated_at: new Date().toISOString(),
    })
    .select('id, ticket_number, created_at')
    .single();

  if (ticketErr || !ticket) {
    return NextResponse.json({ error: ticketErr?.message ?? 'Failed to create ticket' }, { status: 500 });
  }

  const { error: msgErr } = await admin.from('support_ticket_messages').insert({
    ticket_id: ticket.id,
    sender_type: 'customer',
    sender_user_id: auth.userId,
    body: description,
    is_internal: false,
  });
  if (msgErr) {
    return NextResponse.json({ error: 'Ticket created but failed to save message' }, { status: 500 });
  }

  await admin
    .from('support_tickets')
    .update({
      last_reply_at: new Date().toISOString(),
      last_customer_reply_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticket.id);

  await admin.from('support_ticket_activity').insert({
    ticket_id: ticket.id,
    action: 'created',
    actor_user_id: auth.userId,
    new_value: subject,
  });

  return NextResponse.json({ ticket: { id: ticket.id, ticket_number: ticket.ticket_number, created_at: ticket.created_at } });
}
