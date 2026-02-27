import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const { data, error } = await admin
    .from('vouchers')
    .select('id, code, discount_type, discount_value, valid_from, valid_until, max_uses, use_count, min_order_cents, applies_to_skus, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vouchers: data ?? [] });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

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

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!code) return NextResponse.json({ error: 'Code is required' }, { status: 400 });
  const discountType = body.discount_type === 'percent' || body.discount_type === 'fixed' ? body.discount_type : 'percent';
  const discountValue = Math.max(0, Math.floor(Number(body.discount_value) ?? 0));
  if (discountValue <= 0) return NextResponse.json({ error: 'Discount value must be positive' }, { status: 400 });
  if (discountType === 'percent' && discountValue > 100) return NextResponse.json({ error: 'Percent discount must be 1–100' }, { status: 400 });

  const validFrom = body.valid_from ? new Date(body.valid_from).toISOString() : new Date().toISOString();
  const validUntil = body.valid_until ? new Date(body.valid_until).toISOString() : null;
  const maxUses = body.max_uses == null ? null : Math.max(0, Math.floor(Number(body.max_uses)));
  const minOrderCents = body.min_order_cents == null ? null : Math.max(0, Math.floor(Number(body.min_order_cents)));
  const appliesToSkus = Array.isArray(body.applies_to_skus)
    ? body.applies_to_skus.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
    : [];

  const { data, error } = await admin
    .from('vouchers')
    .insert({
      code,
      discount_type: discountType,
      discount_value: discountValue,
      valid_from: validFrom,
      valid_until: validUntil,
      max_uses: maxUses,
      min_order_cents: minOrderCents,
      applies_to_skus: appliesToSkus,
    })
    .select('id, code, discount_type, discount_value, valid_from, valid_until, max_uses, use_count, min_order_cents, applies_to_skus, created_at')
    .single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'A voucher with this code already exists' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
