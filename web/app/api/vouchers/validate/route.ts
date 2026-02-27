import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/admin-auth';

type LineItem = { product_sku: string; quantity: number; unit_price_cents: number };

/** POST /api/vouchers/validate – validate a voucher code and return discount.
 * Body: code, and either subtotal_cents OR items: { product_sku, quantity, unit_price_cents }[].
 * If voucher has applies_to_skus set, discount applies only to those products. */
export async function POST(request: Request) {
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  let body: { code?: string; subtotal_cents?: number; items?: LineItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!code) return NextResponse.json({ valid: false, error: 'Code required' }, { status: 400 });

  let fullSubtotalCents: number;
  let applicableSubtotalCents: number;
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 0) {
    fullSubtotalCents = items.reduce((sum, i) => sum + i.quantity * (i.unit_price_cents || 0), 0);
    applicableSubtotalCents = fullSubtotalCents;
  } else {
    fullSubtotalCents = Math.max(0, Number(body.subtotal_cents) || 0);
    applicableSubtotalCents = fullSubtotalCents;
  }

  const { data: voucher, error } = await admin
    .from('vouchers')
    .select('id, code, discount_type, discount_value, valid_from, valid_until, max_uses, use_count, min_order_cents, applies_to_skus')
    .ilike('code', code)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!voucher) {
    return NextResponse.json({ valid: false, error: 'Invalid or expired code' });
  }

  const now = new Date().toISOString();
  if (new Date(voucher.valid_from) > new Date(now)) {
    return NextResponse.json({ valid: false, error: 'Code not yet valid' });
  }
  if (voucher.valid_until && new Date(voucher.valid_until) < new Date(now)) {
    return NextResponse.json({ valid: false, error: 'Code has expired' });
  }
  if (voucher.max_uses != null && (voucher.use_count ?? 0) >= voucher.max_uses) {
    return NextResponse.json({ valid: false, error: 'Code has reached maximum uses' });
  }
  const minOrder = voucher.min_order_cents ?? 0;
  if (fullSubtotalCents < minOrder) {
    return NextResponse.json({
      valid: false,
      error: minOrder ? `Minimum order $${(minOrder / 100).toFixed(2)} required` : 'Invalid code',
    });
  }

  const appliesToSkus = (voucher.applies_to_skus ?? []) as string[];
  if (items.length > 0 && appliesToSkus.length > 0) {
    const skuSet = new Set(appliesToSkus.map((s) => s?.toLowerCase?.()).filter(Boolean));
    applicableSubtotalCents = items.reduce((sum, i) => {
      if (!skuSet.has((i.product_sku ?? '').toLowerCase())) return sum;
      return sum + i.quantity * (i.unit_price_cents || 0);
    }, 0);
  }

  let discountCents: number;
  if (voucher.discount_type === 'percent') {
    discountCents = Math.round((applicableSubtotalCents * (voucher.discount_value ?? 0)) / 100);
  } else {
    discountCents = Math.min(voucher.discount_value ?? 0, applicableSubtotalCents);
  }
  if (discountCents <= 0) {
    return NextResponse.json({
      valid: false,
      error: appliesToSkus.length > 0 ? 'No discount applied to your selection (voucher may apply to other products)' : 'No discount applied',
    });
  }

  const message =
    voucher.discount_type === 'percent'
      ? `${voucher.discount_value}% off`
      : `$${(discountCents / 100).toFixed(2)} off`;

  return NextResponse.json({
    valid: true,
    voucher_id: voucher.id,
    discount_cents: discountCents,
    message,
  });
}
