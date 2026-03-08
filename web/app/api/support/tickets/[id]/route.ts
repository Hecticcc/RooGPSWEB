import { NextResponse } from 'next/server';
import { getSupportAuth, getServiceRoleClient } from '../../auth';
import { SUPPORT_MESSAGE_PAGE_SIZE } from '@/lib/support/constants';
import { hasMinRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/** GET /api/support/tickets/[id] – ticket detail + messages (customers exclude internal). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getSupportAuth(request);
  if (!authResult.ok) return authResult.response;
  const { auth, supabase } = authResult;
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Ticket ID required' }, { status: 400 });

  const { data: ticket, error: ticketErr } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('id', id)
    .single();

  if (ticketErr || !ticket) {
    return NextResponse.json({ error: ticketErr?.message ?? 'Not found' }, { status: 404 });
  }

  if (!auth.isStaff && (ticket as { user_id: string }).user_id !== auth.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const msgPage = Math.max(1, parseInt(new URL(request.url).searchParams.get('msg_page') ?? '1', 10));
  const msgLimit = Math.min(100, SUPPORT_MESSAGE_PAGE_SIZE);
  const msgFrom = (msgPage - 1) * msgLimit;

  let countQuery = supabase
    .from('support_ticket_messages')
    .select('*', { count: 'exact', head: true })
    .eq('ticket_id', id);
  if (!auth.isStaff) {
    countQuery = countQuery.eq('is_internal', false);
  }
  const { count: messageTotal, error: countErr } = await countQuery;
  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  let msgQuery = supabase
    .from('support_ticket_messages')
    .select('id, ticket_id, sender_type, sender_user_id, body, is_internal, created_at, edited_at')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })
    .range(msgFrom, msgFrom + msgLimit - 1);

  if (!auth.isStaff) {
    msgQuery = msgQuery.eq('is_internal', false);
  }

  const { data: messages, error: msgErr } = await msgQuery;
  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  const staffUserIds = Array.from(new Set(
    (messages ?? [])
      .filter((m: { sender_type: string; sender_user_id: string | null }) => m.sender_type === 'staff' && m.sender_user_id)
      .map((m: { sender_user_id: string }) => m.sender_user_id)
  ));
  let staffNames: Record<string, string> = {};
  if (staffUserIds.length > 0) {
    const admin = getServiceRoleClient();
    if (admin) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('user_id, first_name')
        .in('user_id', staffUserIds);
      staffNames = Object.fromEntries(
        (profiles ?? []).map((p: { user_id: string; first_name: string | null }) => [p.user_id, p.first_name?.trim() || 'Support'])
      );
    }
  }

  const messagesWithSender = (messages ?? []).map((m: { sender_type: string; sender_user_id: string | null; [k: string]: unknown }) => ({
    ...m,
    sender_first_name: m.sender_type === 'staff' && m.sender_user_id ? (staffNames[m.sender_user_id] ?? 'Support') : undefined,
  }));

  const { data: attachments } = await supabase
    .from('support_ticket_attachments')
    .select('id, message_id, file_name, mime_type, file_size, created_at')
    .eq('ticket_id', id);

  let activity = null;
  let context: {
    profile: { first_name: string | null; last_name: string | null; mobile: string | null } | null;
    email: string | null;
    device: { id: string; name: string | null; last_seen_at: string | null } | null;
    order: { id: string; status: string; created_at: string } | null;
    devices: { id: string; name: string | null; last_seen_at: string | null }[];
    subscriptions: { id: string; order_number: string | null; status: string; billing_state_normalized: string | null; stripe_subscription_id: string | null }[];
  } | null = null;
  let assignable_staff: { id: string; first_name: string | null; last_name: string | null }[] = [];
  let assignees: { user_id: string; first_name: string | null; last_name: string | null }[] = [];

  if (auth.isStaff) {
    const { data: act } = await supabase
      .from('support_ticket_activity')
      .select('id, action, actor_user_id, message_id, old_value, new_value, created_at')
      .eq('ticket_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    activity = act;

    const admin = getServiceRoleClient();
    const tid = ticket as { user_id: string; linked_device_id: string | null; linked_order_id: string | null };
    if (admin) {
      const [profileRes, deviceRes, orderRes, staffRolesRes, devicesRes, subsRes, assignmentsRes] = await Promise.all([
        admin.from('profiles').select('first_name, last_name, mobile').eq('user_id', tid.user_id).maybeSingle(),
        tid.linked_device_id ? admin.from('devices').select('id, name, model_name, last_seen_at').eq('id', tid.linked_device_id).maybeSingle() : Promise.resolve({ data: null }),
        tid.linked_order_id ? admin.from('orders').select('id, status, created_at').eq('id', tid.linked_order_id).maybeSingle() : Promise.resolve({ data: null }),
        admin.from('user_roles').select('user_id').in('role', ['staff', 'staff_plus', 'administrator']),
        admin.from('devices').select('id, name, model_name, last_seen_at').eq('user_id', tid.user_id).order('created_at', { ascending: false }),
        admin.from('orders').select('id, order_number, status, billing_state_normalized, stripe_subscription_id').eq('user_id', tid.user_id).not('stripe_subscription_id', 'is', null).order('created_at', { ascending: false }).limit(20),
        admin.from('support_ticket_assignments').select('user_id').eq('ticket_id', id),
      ]);
      const profile = profileRes?.data ?? null;
      const device = deviceRes?.data ?? null;
      const order = orderRes?.data ?? null;
      const devices = devicesRes?.data ?? [];
      const subscriptions = (subsRes?.data ?? []).map((s: { id: string; order_number: string | null; status: string; billing_state_normalized: string | null; stripe_subscription_id: string | null }) => ({
        id: s.id,
        order_number: s.order_number ?? null,
        status: s.status,
        billing_state_normalized: s.billing_state_normalized ?? null,
        stripe_subscription_id: s.stripe_subscription_id ?? null,
      }));
      let email: string | null = null;
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(tid.user_id);
        email = authUser?.user?.email ?? null;
      } catch {
        // ignore
      }
      context = { profile, email, device, order, devices, subscriptions };

      const staffIds = (staffRolesRes?.data ?? []).map((r: { user_id: string }) => r.user_id);
      if (staffIds.length > 0) {
        const { data: staffProfiles } = await admin.from('profiles').select('user_id, first_name, last_name').in('user_id', staffIds);
        assignable_staff = (staffProfiles ?? []).map((p: { user_id: string; first_name: string | null; last_name: string | null }) => ({
          id: p.user_id,
          first_name: p.first_name ?? null,
          last_name: p.last_name ?? null,
        }));
      }
      const assigneeIds = (assignmentsRes?.data ?? []).map((a: { user_id: string }) => a.user_id);
      if (assigneeIds.length > 0) {
        const { data: assigneeProfiles } = await admin.from('profiles').select('user_id, first_name, last_name').in('user_id', assigneeIds);
        const byId = new Map((assigneeProfiles ?? []).map((p: { user_id: string; first_name: string | null; last_name: string | null }) => [p.user_id, p]));
        assignees = assigneeIds.map((uid: string) => {
          const p = byId.get(uid);
          return p ? { user_id: uid, first_name: p.first_name ?? null, last_name: p.last_name ?? null } : { user_id: uid, first_name: null, last_name: null };
        });
      }
    }
  }

  return NextResponse.json({
    ticket,
    messages: messagesWithSender,
    attachments: attachments ?? [],
    activity: activity ?? [],
    context: context ?? undefined,
    assignable_staff,
    assignees,
    current_user_id: auth.isStaff ? auth.userId : undefined,
    message_page: msgPage,
    message_limit: msgLimit,
    message_total: messageTotal ?? 0,
  });
}

/** PATCH /api/support/tickets/[id] – update ticket. Customer: close/reopen only (if allowed). Staff: status, priority, assignment. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getSupportAuth(request);
  if (!authResult.ok) return authResult.response;
  const { auth } = authResult;
  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Ticket ID required' }, { status: 400 });

  const { data: existing } = await admin.from('support_tickets').select('*').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isOwner = (existing as { user_id: string }).user_id === auth.userId;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const activityRows: { ticket_id: string; action: string; actor_user_id: string; old_value: string | null; new_value: string | null }[] = [];

  if (auth.isStaff) {
    if (body.status !== undefined && typeof body.status === 'string') {
      updates.status = body.status;
      activityRows.push({
        ticket_id: id,
        action: 'status_changed',
        actor_user_id: auth.userId,
        old_value: (existing as { status: string }).status,
        new_value: body.status,
      });
      if (['closed', 'resolved'].includes(body.status)) {
        updates.closed_at = new Date().toISOString();
        updates.closed_by = auth.userId;
      }
    }
    if (body.priority !== undefined && typeof body.priority === 'string') {
      updates.priority = body.priority;
      activityRows.push({
        ticket_id: id,
        action: 'priority_changed',
        actor_user_id: auth.userId,
        old_value: (existing as { priority: string }).priority,
        new_value: body.priority,
      });
    }
    if (body.assignee_ids !== undefined && Array.isArray(body.assignee_ids)) {
      const newIds = (body.assignee_ids as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0);
      const uniq = Array.from(new Set(newIds));
      const { data: oldRows } = await admin.from('support_ticket_assignments').select('user_id').eq('ticket_id', id);
      let oldIds = (oldRows ?? []).map((r: { user_id: string }) => r.user_id);
      if (oldIds.length === 0 && (existing as { assigned_to: string | null }).assigned_to) oldIds = [(existing as { assigned_to: string }).assigned_to];
      const { error: delErr } = await admin.from('support_ticket_assignments').delete().eq('ticket_id', id);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
      if (uniq.length > 0) {
        const { error: insErr } = await admin.from('support_ticket_assignments').insert(uniq.map((user_id) => ({ ticket_id: id, user_id })));
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
      updates.assigned_to = uniq[0] ?? null;
      activityRows.push({
        ticket_id: id,
        action: 'assignment_changed',
        actor_user_id: auth.userId,
        old_value: oldIds.length ? oldIds.join(',') : null,
        new_value: uniq.length ? uniq.join(',') : null,
      });
    } else if (body.assigned_to !== undefined) {
      const assigned: string | null =
        body.assigned_to === null || body.assigned_to === '' ? null : typeof body.assigned_to === 'string' ? body.assigned_to : null;
      const assigneeIds = assigned ? [assigned] : [];
      const { error: delErr } = await admin.from('support_ticket_assignments').delete().eq('ticket_id', id);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
      if (assigneeIds.length > 0) {
        await admin.from('support_ticket_assignments').insert(assigneeIds.map((user_id) => ({ ticket_id: id, user_id })));
      }
      updates.assigned_to = assigned;
      activityRows.push({
        ticket_id: id,
        action: 'assignment_changed',
        actor_user_id: auth.userId,
        old_value: (existing as { assigned_to: string | null }).assigned_to,
        new_value: assigned,
      });
    }
  }

  if (isOwner) {
    if (body.status === 'closed' && (existing as { allow_customer_close: boolean }).allow_customer_close) {
      updates.status = 'closed';
      updates.closed_at = new Date().toISOString();
      updates.closed_by = auth.userId;
      activityRows.push({
        ticket_id: id,
        action: 'customer_closed',
        actor_user_id: auth.userId,
        old_value: (existing as { status: string }).status,
        new_value: 'closed',
      });
    }
    if (body.reopen === true && (existing as { allow_customer_reopen: boolean }).allow_customer_reopen) {
      const closedAt = (existing as { closed_at: string | null }).closed_at;
      const windowMs = ((existing as { reopen_window_hours: number }).reopen_window_hours ?? 168) * 60 * 60 * 1000;
      if (closedAt && Date.now() - new Date(closedAt).getTime() <= windowMs) {
        updates.status = 'open';
        updates.closed_at = null;
        updates.closed_by = null;
        updates.reopened_at = new Date().toISOString();
        activityRows.push({
          ticket_id: id,
          action: 'customer_reopened',
          actor_user_id: auth.userId,
          old_value: 'closed',
          new_value: 'open',
        });
      }
    }
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: 'No valid updates' }, { status: 400 });
  }

  const { error: updateErr } = await admin.from('support_tickets').update(updates).eq('id', id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  for (const row of activityRows) {
    await admin.from('support_ticket_activity').insert(row);
  }

  const existingStatus = (existing as { status: string }).status;

  // Auto-add a visible "Ticket closed by [Name] (Customer|Staff)" system message when ticket is closed
  if (updates.status === 'closed') {
    const closerId = (updates.closed_by as string) ?? auth.userId;
    let closerName = 'Someone';
    const { data: profile } = await admin.from('profiles').select('first_name, last_name').eq('user_id', closerId).maybeSingle();
    if (profile && (profile.first_name || profile.last_name)) {
      closerName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
    }
    const closedByRole = auth.isStaff ? 'Staff' : 'Customer';
    const closureBody = `Ticket closed by ${closerName} (${closedByRole}).`;
    await admin.from('support_ticket_messages').insert({
      ticket_id: id,
      sender_type: 'system',
      sender_user_id: null,
      body: closureBody,
      is_internal: false,
    });
  }

  // Auto-add a visible "Ticket reopened by [Name] (Customer|Staff)" system message when ticket is reopened
  if (updates.status === 'open' && ['closed', 'resolved'].includes(existingStatus)) {
    const reopenerId = auth.userId;
    let reopenerName = 'Someone';
    const { data: profile } = await admin.from('profiles').select('first_name, last_name').eq('user_id', reopenerId).maybeSingle();
    if (profile && (profile.first_name || profile.last_name)) {
      reopenerName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
    }
    const reopenedByRole = auth.isStaff ? 'Staff' : 'Customer';
    const reopenBody = `Ticket reopened by ${reopenerName} (${reopenedByRole}).`;
    await admin.from('support_ticket_messages').insert({
      ticket_id: id,
      sender_type: 'system',
      sender_user_id: null,
      body: reopenBody,
      is_internal: false,
    });
  }

  return NextResponse.json({ ok: true });
}
