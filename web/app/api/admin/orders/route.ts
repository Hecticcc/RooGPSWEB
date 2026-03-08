import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 25;
const SORT_FIELDS = ['created_at', 'status', 'order_number'] as const;
const ORDER_DIRS = ['asc', 'desc'] as const;

/** GET /api/admin/orders – list orders with pagination, search (order # or customer email), sort (staff+) */
export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Admin API requires SUPABASE_SERVICE_ROLE_KEY in server environment (see .env.local or deployment env)' }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? String(DEFAULT_PAGE), 10) || DEFAULT_PAGE);
  const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get('per_page') ?? String(DEFAULT_PER_PAGE), 10) || DEFAULT_PER_PAGE));
  const search = (searchParams.get('search') ?? '').trim();
  const tab = (searchParams.get('tab') ?? 'other').toLowerCase();
  const activatedOnly = tab === 'activated';
  const sort = SORT_FIELDS.includes(searchParams.get('sort') as (typeof SORT_FIELDS)[number])
    ? (searchParams.get('sort') as (typeof SORT_FIELDS)[number])
    : 'created_at';
  const order = ORDER_DIRS.includes(searchParams.get('order') as (typeof ORDER_DIRS)[number])
    ? (searchParams.get('order') as (typeof ORDER_DIRS)[number])
    : 'desc';

  let userIdsFromEmail: string[] = [];
  if (search.length > 0) {
    const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const searchLower = search.toLowerCase();
    userIdsFromEmail = (authData?.users ?? [])
      .filter((u) => u.email?.toLowerCase().includes(searchLower))
      .map((u) => u.id);
  }

  let query = admin
    .from('orders')
    .select('id, order_number, user_id, status, total_cents, currency, tracking_number, created_at, updated_at', {
      count: 'exact',
    })
    .order(sort, { ascending: order === 'asc' });

  if (activatedOnly) {
    query = query.eq('status', 'activated');
  } else {
    query = query.neq('status', 'activated');
  }

  if (search.length > 0) {
    const searchEscaped = search.replace(/%/g, '\\%').replace(/\\/g, '\\\\');
    if (userIdsFromEmail.length > 0) {
      query = query.or(
        `order_number.ilike.%${searchEscaped}%,user_id.in.(${userIdsFromEmail.join(',')})`
      );
    } else {
      query = query.ilike('order_number', `%${search}%`);
    }
  }

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const { data: orders, error, count } = await query.range(from, to);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const total = count ?? (orders ?? []).length;
  const userIds = Array.from(new Set((orders ?? []).map((o) => o.user_id).filter(Boolean)));
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 500 });
  const emailByUser = new Map((authData?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const list = (orders ?? []).map((o) => ({
    ...o,
    user_email: emailByUser.get(o.user_id) ?? null,
  }));

  return NextResponse.json({
    orders: list,
    total: typeof total === 'number' ? total : list.length,
    page,
    per_page: perPage,
    total_pages: Math.max(1, Math.ceil((typeof total === 'number' ? total : list.length) / perPage)),
  });
}
