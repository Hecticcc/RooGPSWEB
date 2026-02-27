import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { id } = await params;
  const { data, error } = await admin.from('vouchers').select('*').eq('id', id).single();
  if (error || !data) return NextResponse.json({ error: 'Voucher not found' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { id } = await params;

  let body: {
    code?: string;
    discount_type?: string;
    discount_value?: number;
    valid_from?: string;
    valid_until?: string;
    max_uses?: number | null;
    min_order_cents?: number | null;
    applies_to_skus?: string[] | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const payload: Record<string, unknown> = {};
  if (typeof body.code === 'string') payload.code = body.code.trim().toUpperCase();
  if (body.discount_type === 'percent' || body.discount_type === 'fixed') payload.discount_type = body.discount_type;
  if (typeof body.discount_value === 'number' && body.discount_value >= 0) payload.discount_value = body.discount_value;
  if (body.valid_from !== undefined) payload.valid_from = body.valid_from ? new Date(body.valid_from).toISOString() : null;
  if (body.valid_until !== undefined) payload.valid_until = body.valid_until ? new Date(body.valid_until).toISOString() : null;
  if (body.max_uses !== undefined) payload.max_uses = body.max_uses == null ? null : Math.max(0, Math.floor(Number(body.max_uses)));
  if (body.min_order_cents !== undefined) payload.min_order_cents = body.min_order_cents == null ? null : Math.max(0, Math.floor(Number(body.min_order_cents)));
  if (body.applies_to_skus !== undefined) {
    payload.applies_to_skus = Array.isArray(body.applies_to_skus)
      ? body.applies_to_skus.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
      : [];
  }

  const { data, error } = await admin.from('vouchers').update(payload).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { id } = await params;
  const { error } = await admin.from('vouchers').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
