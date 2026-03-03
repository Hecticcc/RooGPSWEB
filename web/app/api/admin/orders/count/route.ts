import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

/** GET /api/admin/orders/count – count of orders with status 'paid' only (staff+). Used for the Orders nav badge. */
export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Admin API requires SUPABASE_SERVICE_ROLE_KEY' },
      { status: 503 }
    );
  }
  const { count, error } = await admin
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'paid');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: count ?? 0 });
}
