import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/admin-auth';
import { createServiceRoleClient } from '@/lib/admin-auth';

/** GET /api/admin/orders/[id]/payment-log – list Stripe payment log entries for this order (staff+) */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const { id: orderId } = await params;
  if (!orderId) return NextResponse.json({ error: 'Order ID required' }, { status: 400 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const { data: rows, error } = await admin
    .from('stripe_payment_log')
    .select('id, event_type, stripe_event_id, stripe_object_id, payload, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ log: rows ?? [] });
}
